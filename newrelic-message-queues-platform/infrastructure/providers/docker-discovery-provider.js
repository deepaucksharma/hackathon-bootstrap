/**
 * Docker Discovery Provider
 * 
 * Discovers message queue infrastructure running as Docker containers.
 * Supports discovery through Docker API, container labels, and network inspection.
 */

const BaseDiscoveryService = require('../discovery/base-discovery-service');
const Docker = require('dockerode');

class DockerDiscoveryProvider extends BaseDiscoveryService {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      ...this.config,
      socketPath: config.socketPath || '/var/run/docker.sock',
      host: config.host,
      port: config.port,
      protocol: config.protocol || 'http',
      includeContainers: config.includeContainers !== false,
      includeServices: config.includeServices !== false,
      includeNetworks: config.includeNetworks !== false,
      labelFilters: config.labelFilters || [],
      networkFilters: config.networkFilters || []
    };

    // Initialize Docker client
    const dockerOptions = {};
    if (this.config.host) {
      dockerOptions.host = this.config.host;
      dockerOptions.port = this.config.port || 2375;
      dockerOptions.protocol = this.config.protocol;
    } else {
      dockerOptions.socketPath = this.config.socketPath;
    }
    
    this.docker = new Docker(dockerOptions);

    // Message queue container patterns
    this.messageQueuePatterns = {
      kafka: {
        images: ['confluentinc/cp-kafka', 'bitnami/kafka', 'wurstmeister/kafka', 'strimzi/kafka'],
        labels: ['com.docker.compose.service=kafka', 'io.confluent.docker.service=kafka'],
        ports: [9092, 9093, 9094],
        envPatterns: ['KAFKA_', 'CONFLUENT_']
      },
      zookeeper: {
        images: ['confluentinc/cp-zookeeper', 'bitnami/zookeeper', 'wurstmeister/zookeeper'],
        labels: ['com.docker.compose.service=zookeeper'],
        ports: [2181, 2888, 3888],
        envPatterns: ['ZOOKEEPER_', 'ZOO_']
      },
      rabbitmq: {
        images: ['rabbitmq', 'bitnami/rabbitmq'],
        labels: ['com.docker.compose.service=rabbitmq'],
        ports: [5672, 15672, 25672],
        envPatterns: ['RABBITMQ_']
      },
      redis: {
        images: ['redis', 'bitnami/redis'],
        labels: ['com.docker.compose.service=redis'],
        ports: [6379],
        envPatterns: ['REDIS_']
      },
      activemq: {
        images: ['rmohr/activemq', 'webcenter/activemq', 'symptoma/activemq'],
        labels: ['com.docker.compose.service=activemq'],
        ports: [61616, 8161, 5672, 61613, 1883],
        envPatterns: ['ACTIVEMQ_']
      },
      nats: {
        images: ['nats', 'bitnami/nats'],
        labels: ['com.docker.compose.service=nats'],
        ports: [4222, 6222, 8222],
        envPatterns: ['NATS_']
      },
      pulsar: {
        images: ['apachepulsar/pulsar', 'streamnative/pulsar'],
        labels: ['com.docker.compose.service=pulsar'],
        ports: [6650, 8080],
        envPatterns: ['PULSAR_']
      }
    };
  }

  /**
   * Discover Docker resources
   */
  async discoverResources() {
    const resources = [];
    
    try {
      // Verify Docker connection
      await this.docker.ping();
      
      // Discover different resource types in parallel
      const [containers, services, networks] = await Promise.all([
        this.config.includeContainers ? this.discoverContainers() : [],
        this.config.includeServices ? this.discoverServices() : [],
        this.config.includeNetworks ? this.discoverNetworks() : []
      ]);

      resources.push(...containers, ...services);
      
      // Enrich resources with network information
      if (networks.length > 0) {
        this.enrichWithNetworkInfo(resources, networks);
      }
      
    } catch (error) {
      throw new Error(`Docker discovery failed: ${error.message}`);
    }

    return resources;
  }

  /**
   * Discover containers
   */
  async discoverContainers() {
    const resources = [];
    
    try {
      const containers = await this.docker.listContainers({ all: true });
      
      for (const containerInfo of containers) {
        if (this.matchesFilters(containerInfo)) {
          // Get detailed container info
          const container = this.docker.getContainer(containerInfo.Id);
          const inspect = await container.inspect();
          
          resources.push({
            type: 'container',
            info: containerInfo,
            inspect: inspect
          });
        }
      }
    } catch (error) {
      this.emit('resource:error', {
        type: 'Container',
        error: error.message
      });
    }

    return resources;
  }

  /**
   * Discover Docker Swarm services
   */
  async discoverServices() {
    const resources = [];
    
    try {
      // Check if Docker is in Swarm mode
      const info = await this.docker.info();
      
      if (info.Swarm && info.Swarm.LocalNodeState === 'active') {
        const services = await this.docker.listServices();
        
        for (const service of services) {
          if (this.matchesServiceFilters(service)) {
            resources.push({
              type: 'service',
              service: service
            });
          }
        }
      }
    } catch (error) {
      // Swarm mode might not be enabled
      this.emit('resource:error', {
        type: 'Service',
        error: `Swarm services discovery failed: ${error.message}`
      });
    }

    return resources;
  }

  /**
   * Discover networks
   */
  async discoverNetworks() {
    const networks = [];
    
    try {
      const networkList = await this.docker.listNetworks();
      
      for (const network of networkList) {
        if (this.matchesNetworkFilters(network)) {
          networks.push(network);
        }
      }
    } catch (error) {
      this.emit('resource:error', {
        type: 'Network',
        error: error.message
      });
    }

    return networks;
  }

  /**
   * Check if container matches filters
   */
  matchesFilters(container) {
    if (this.config.labelFilters.length > 0) {
      const labels = container.Labels || {};
      const hasMatchingLabel = this.config.labelFilters.some(filter => {
        const [key, value] = filter.split('=');
        return value ? labels[key] === value : key in labels;
      });
      
      if (!hasMatchingLabel) return false;
    }

    return true;
  }

  /**
   * Check if service matches filters
   */
  matchesServiceFilters(service) {
    if (this.config.labelFilters.length > 0) {
      const labels = service.Spec.Labels || {};
      const hasMatchingLabel = this.config.labelFilters.some(filter => {
        const [key, value] = filter.split('=');
        return value ? labels[key] === value : key in labels;
      });
      
      if (!hasMatchingLabel) return false;
    }

    return true;
  }

  /**
   * Check if network matches filters
   */
  matchesNetworkFilters(network) {
    if (this.config.networkFilters.length > 0) {
      return this.config.networkFilters.includes(network.Name);
    }
    return true;
  }

  /**
   * Enrich resources with network information
   */
  enrichWithNetworkInfo(resources, networks) {
    const networkMap = new Map(networks.map(n => [n.Id, n]));
    
    for (const resource of resources) {
      if (resource.type === 'container' && resource.inspect.NetworkSettings) {
        const networkInfo = [];
        
        for (const [networkName, config] of Object.entries(resource.inspect.NetworkSettings.Networks || {})) {
          networkInfo.push({
            name: networkName,
            ipAddress: config.IPAddress,
            gateway: config.Gateway,
            macAddress: config.MacAddress,
            networkId: config.NetworkID
          });
        }
        
        resource.networks = networkInfo;
      }
    }
  }

  /**
   * Normalize Docker resource to standard format
   */
  async normalizeResource(resource) {
    if (resource.type === 'container') {
      return this.normalizeContainer(resource);
    } else if (resource.type === 'service') {
      return this.normalizeService(resource);
    }
    
    throw new Error(`Unknown resource type: ${resource.type}`);
  }

  /**
   * Normalize container to standard format
   */
  normalizeContainer(resource) {
    const messageQueueType = this.detectMessageQueueType(resource);
    const containerInfo = resource.info;
    const inspect = resource.inspect;
    
    return {
      id: this.generateResourceId(resource),
      type: messageQueueType || 'unknown',
      provider: 'docker',
      metadata: {
        containerId: inspect.Id,
        name: inspect.Name.replace(/^\//, ''),
        image: inspect.Config.Image,
        imageId: inspect.Image,
        created: inspect.Created,
        labels: inspect.Config.Labels || {},
        state: inspect.State.Status,
        restartCount: inspect.RestartCount,
        platform: inspect.Platform
      },
      config: {
        hostname: inspect.Config.Hostname,
        domainname: inspect.Config.Domainname,
        ports: this.extractPorts(inspect),
        env: this.extractEnvVars(inspect),
        volumes: this.extractVolumes(inspect),
        networks: resource.networks || [],
        cmd: inspect.Config.Cmd,
        entrypoint: inspect.Config.Entrypoint,
        workingDir: inspect.Config.WorkingDir
      },
      status: {
        state: inspect.State.Status,
        running: inspect.State.Running,
        paused: inspect.State.Paused,
        restarting: inspect.State.Restarting,
        oomKilled: inspect.State.OOMKilled,
        dead: inspect.State.Dead,
        pid: inspect.State.Pid,
        exitCode: inspect.State.ExitCode,
        startedAt: inspect.State.StartedAt,
        finishedAt: inspect.State.FinishedAt
      },
      endpoints: this.extractEndpoints(resource),
      raw: resource
    };
  }

  /**
   * Normalize service to standard format
   */
  normalizeService(resource) {
    const service = resource.service;
    const messageQueueType = this.detectServiceMessageQueueType(service);
    
    return {
      id: `docker:service:${service.ID}`,
      type: messageQueueType || 'unknown',
      provider: 'docker-swarm',
      metadata: {
        serviceId: service.ID,
        name: service.Spec.Name,
        labels: service.Spec.Labels || {},
        version: service.Version.Index,
        createdAt: service.CreatedAt,
        updatedAt: service.UpdatedAt
      },
      config: {
        mode: service.Spec.Mode,
        replicas: this.extractServiceReplicas(service),
        image: service.Spec.TaskTemplate.ContainerSpec.Image,
        env: this.extractServiceEnvVars(service),
        ports: this.extractServicePorts(service),
        networks: service.Spec.TaskTemplate.Networks || []
      },
      status: {
        replicas: service.ServiceStatus ? service.ServiceStatus.RunningTasks : 0,
        desiredTasks: service.ServiceStatus ? service.ServiceStatus.DesiredTasks : 0
      },
      endpoints: this.extractServiceEndpoints(service),
      raw: resource
    };
  }

  /**
   * Detect message queue type from container
   */
  detectMessageQueueType(resource) {
    const inspect = resource.inspect;
    const image = inspect.Config.Image.toLowerCase();
    const labels = inspect.Config.Labels || {};
    const env = inspect.Config.Env || [];
    
    // Check by image name
    for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
      for (const imagePattern of patterns.images) {
        if (image.includes(imagePattern.toLowerCase())) {
          return type;
        }
      }
    }
    
    // Check by labels
    for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
      for (const labelPattern of patterns.labels) {
        const [key, value] = labelPattern.split('=');
        if (value ? labels[key] === value : key in labels) {
          return type;
        }
      }
    }
    
    // Check by environment variables
    for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
      for (const envPattern of patterns.envPatterns) {
        if (env.some(e => e.startsWith(envPattern))) {
          return type;
        }
      }
    }
    
    // Check by exposed ports
    const ports = this.extractPorts(inspect);
    for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
      for (const port of patterns.ports) {
        if (ports.includes(port)) {
          return type;
        }
      }
    }
    
    return null;
  }

  /**
   * Detect message queue type from service
   */
  detectServiceMessageQueueType(service) {
    const image = service.Spec.TaskTemplate.ContainerSpec.Image.toLowerCase();
    const labels = service.Spec.Labels || {};
    
    // Check by image name
    for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
      for (const imagePattern of patterns.images) {
        if (image.includes(imagePattern.toLowerCase())) {
          return type;
        }
      }
    }
    
    // Check by labels
    for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
      for (const labelPattern of patterns.labels) {
        const [key, value] = labelPattern.split('=');
        if (value ? labels[key] === value : key in labels) {
          return type;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract ports from container
   */
  extractPorts(inspect) {
    const ports = [];
    
    // Extract from exposed ports
    if (inspect.Config.ExposedPorts) {
      for (const port of Object.keys(inspect.Config.ExposedPorts)) {
        const portNum = parseInt(port.split('/')[0]);
        if (!isNaN(portNum)) {
          ports.push(portNum);
        }
      }
    }
    
    // Extract from port bindings
    if (inspect.HostConfig && inspect.HostConfig.PortBindings) {
      for (const [containerPort, hostBindings] of Object.entries(inspect.HostConfig.PortBindings)) {
        const portNum = parseInt(containerPort.split('/')[0]);
        if (!isNaN(portNum) && !ports.includes(portNum)) {
          ports.push(portNum);
        }
      }
    }
    
    return ports;
  }

  /**
   * Extract environment variables
   */
  extractEnvVars(inspect) {
    const envVars = {};
    
    if (inspect.Config.Env) {
      for (const env of inspect.Config.Env) {
        const [key, ...valueParts] = env.split('=');
        envVars[key] = valueParts.join('=');
      }
    }
    
    return envVars;
  }

  /**
   * Extract volumes
   */
  extractVolumes(inspect) {
    const volumes = [];
    
    if (inspect.Mounts) {
      for (const mount of inspect.Mounts) {
        volumes.push({
          type: mount.Type,
          name: mount.Name,
          source: mount.Source,
          destination: mount.Destination,
          mode: mount.Mode,
          rw: mount.RW
        });
      }
    }
    
    return volumes;
  }

  /**
   * Extract endpoints from container
   */
  extractEndpoints(resource) {
    const endpoints = [];
    const inspect = resource.inspect;
    
    // Get port bindings
    if (inspect.NetworkSettings && inspect.NetworkSettings.Ports) {
      for (const [containerPort, hostBindings] of Object.entries(inspect.NetworkSettings.Ports)) {
        if (hostBindings && hostBindings.length > 0) {
          const portNum = parseInt(containerPort.split('/')[0]);
          
          for (const binding of hostBindings) {
            endpoints.push({
              type: 'host',
              host: binding.HostIp || '0.0.0.0',
              port: parseInt(binding.HostPort),
              containerPort: portNum,
              protocol: containerPort.split('/')[1] || 'tcp'
            });
          }
        }
      }
    }
    
    // Add network endpoints
    if (resource.networks) {
      for (const network of resource.networks) {
        if (network.ipAddress) {
          const ports = this.extractPorts(inspect);
          for (const port of ports) {
            endpoints.push({
              type: 'network',
              network: network.name,
              host: network.ipAddress,
              port: port,
              protocol: 'tcp'
            });
          }
        }
      }
    }
    
    return endpoints;
  }

  /**
   * Extract service replicas
   */
  extractServiceReplicas(service) {
    if (service.Spec.Mode.Replicated) {
      return service.Spec.Mode.Replicated.Replicas;
    } else if (service.Spec.Mode.Global) {
      return 'global';
    }
    return 1;
  }

  /**
   * Extract service environment variables
   */
  extractServiceEnvVars(service) {
    const envVars = {};
    const env = service.Spec.TaskTemplate.ContainerSpec.Env || [];
    
    for (const envVar of env) {
      const [key, ...valueParts] = envVar.split('=');
      envVars[key] = valueParts.join('=');
    }
    
    return envVars;
  }

  /**
   * Extract service ports
   */
  extractServicePorts(service) {
    const ports = [];
    
    if (service.Endpoint && service.Endpoint.Ports) {
      for (const port of service.Endpoint.Ports) {
        ports.push({
          protocol: port.Protocol,
          targetPort: port.TargetPort,
          publishedPort: port.PublishedPort,
          publishMode: port.PublishMode
        });
      }
    }
    
    return ports;
  }

  /**
   * Extract service endpoints
   */
  extractServiceEndpoints(service) {
    const endpoints = [];
    
    if (service.Endpoint && service.Endpoint.VirtualIPs) {
      for (const vip of service.Endpoint.VirtualIPs) {
        endpoints.push({
          type: 'vip',
          networkId: vip.NetworkID,
          address: vip.Addr
        });
      }
    }
    
    if (service.Endpoint && service.Endpoint.Ports) {
      for (const port of service.Endpoint.Ports) {
        endpoints.push({
          type: 'published',
          protocol: port.Protocol,
          port: port.PublishedPort,
          targetPort: port.TargetPort
        });
      }
    }
    
    return endpoints;
  }

  /**
   * Generate unique resource ID
   */
  generateResourceId(resource) {
    if (resource.type === 'container') {
      return `docker:container:${resource.inspect.Id}`;
    }
    return `docker:${resource.type}:${resource.id}`;
  }

  /**
   * Check if resource is a message queue system
   */
  isMessageQueueResource(resource) {
    return resource.type !== 'unknown' && resource.type !== null;
  }
}

module.exports = DockerDiscoveryProvider;