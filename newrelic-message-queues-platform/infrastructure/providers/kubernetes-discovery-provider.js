/**
 * Kubernetes Discovery Provider
 * 
 * Discovers message queue infrastructure running in Kubernetes clusters.
 * Supports discovery of Kafka, RabbitMQ, Redis, and other message queue
 * systems through label selectors, annotations, and service discovery.
 */

const BaseDiscoveryService = require('../discovery/base-discovery-service');
const k8s = require('@kubernetes/client-node');

class KubernetesDiscoveryProvider extends BaseDiscoveryService {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      ...this.config,
      namespace: config.namespace || 'default',
      allNamespaces: config.allNamespaces || false,
      labelSelectors: config.labelSelectors || [],
      annotationFilters: config.annotationFilters || [],
      includeServices: config.includeServices !== false,
      includeStatefulSets: config.includeStatefulSets !== false,
      includeDeployments: config.includeDeployments !== false,
      includePods: config.includePods !== false,
      kubeConfig: config.kubeConfig
    };

    // Initialize Kubernetes client
    this.kc = new k8s.KubeConfig();
    
    if (this.config.kubeConfig) {
      this.kc.loadFromString(this.config.kubeConfig);
    } else {
      try {
        this.kc.loadFromDefault();
      } catch (error) {
        // Try in-cluster config
        this.kc.loadFromCluster();
      }
    }

    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);

    // Message queue patterns
    this.messageQueuePatterns = {
      kafka: {
        labels: ['app.kubernetes.io/name=kafka', 'app=kafka', 'component=kafka'],
        images: ['confluentinc/cp-kafka', 'bitnami/kafka', 'strimzi/kafka'],
        ports: [9092, 9093, 9094]
      },
      rabbitmq: {
        labels: ['app.kubernetes.io/name=rabbitmq', 'app=rabbitmq'],
        images: ['rabbitmq', 'bitnami/rabbitmq'],
        ports: [5672, 15672]
      },
      redis: {
        labels: ['app.kubernetes.io/name=redis', 'app=redis'],
        images: ['redis', 'bitnami/redis'],
        ports: [6379]
      },
      activemq: {
        labels: ['app=activemq'],
        images: ['rmohr/activemq', 'webcenter/activemq'],
        ports: [61616, 8161]
      },
      nats: {
        labels: ['app=nats'],
        images: ['nats', 'bitnami/nats'],
        ports: [4222, 6222, 8222]
      }
    };
  }

  /**
   * Discover Kubernetes resources
   */
  async discoverResources() {
    const resources = [];
    
    try {
      // Discover different resource types in parallel
      const [services, statefulSets, deployments, pods] = await Promise.all([
        this.config.includeServices ? this.discoverServices() : [],
        this.config.includeStatefulSets ? this.discoverStatefulSets() : [],
        this.config.includeDeployments ? this.discoverDeployments() : [],
        this.config.includePods ? this.discoverPods() : []
      ]);

      resources.push(...services, ...statefulSets, ...deployments, ...pods);
      
    } catch (error) {
      throw new Error(`Kubernetes discovery failed: ${error.message}`);
    }

    return resources;
  }

  /**
   * Discover services
   */
  async discoverServices() {
    const resources = [];
    const namespace = this.config.allNamespaces ? '' : this.config.namespace;
    
    try {
      const response = namespace
        ? await this.k8sApi.listNamespacedService(namespace)
        : await this.k8sApi.listServiceForAllNamespaces();

      for (const service of response.body.items) {
        if (this.matchesFilters(service)) {
          resources.push({
            kind: 'Service',
            metadata: service.metadata,
            spec: service.spec,
            status: service.status
          });
        }
      }
    } catch (error) {
      this.emit('resource:error', {
        type: 'Service',
        error: error.message
      });
    }

    return resources;
  }

  /**
   * Discover StatefulSets
   */
  async discoverStatefulSets() {
    const resources = [];
    const namespace = this.config.allNamespaces ? '' : this.config.namespace;
    
    try {
      const response = namespace
        ? await this.k8sAppsApi.listNamespacedStatefulSet(namespace)
        : await this.k8sAppsApi.listStatefulSetForAllNamespaces();

      for (const statefulSet of response.body.items) {
        if (this.matchesFilters(statefulSet)) {
          resources.push({
            kind: 'StatefulSet',
            metadata: statefulSet.metadata,
            spec: statefulSet.spec,
            status: statefulSet.status
          });
        }
      }
    } catch (error) {
      this.emit('resource:error', {
        type: 'StatefulSet',
        error: error.message
      });
    }

    return resources;
  }

  /**
   * Discover Deployments
   */
  async discoverDeployments() {
    const resources = [];
    const namespace = this.config.allNamespaces ? '' : this.config.namespace;
    
    try {
      const response = namespace
        ? await this.k8sAppsApi.listNamespacedDeployment(namespace)
        : await this.k8sAppsApi.listDeploymentForAllNamespaces();

      for (const deployment of response.body.items) {
        if (this.matchesFilters(deployment)) {
          resources.push({
            kind: 'Deployment',
            metadata: deployment.metadata,
            spec: deployment.spec,
            status: deployment.status
          });
        }
      }
    } catch (error) {
      this.emit('resource:error', {
        type: 'Deployment',
        error: error.message
      });
    }

    return resources;
  }

  /**
   * Discover Pods
   */
  async discoverPods() {
    const resources = [];
    const namespace = this.config.allNamespaces ? '' : this.config.namespace;
    
    try {
      const response = namespace
        ? await this.k8sApi.listNamespacedPod(namespace)
        : await this.k8sApi.listPodForAllNamespaces();

      for (const pod of response.body.items) {
        if (this.matchesFilters(pod)) {
          resources.push({
            kind: 'Pod',
            metadata: pod.metadata,
            spec: pod.spec,
            status: pod.status
          });
        }
      }
    } catch (error) {
      this.emit('resource:error', {
        type: 'Pod',
        error: error.message
      });
    }

    return resources;
  }

  /**
   * Check if resource matches configured filters
   */
  matchesFilters(resource) {
    // Check label selectors
    if (this.config.labelSelectors.length > 0) {
      const labels = resource.metadata.labels || {};
      const hasMatchingLabel = this.config.labelSelectors.some(selector => {
        const [key, value] = selector.split('=');
        return labels[key] === value;
      });
      
      if (!hasMatchingLabel) return false;
    }

    // Check annotation filters
    if (this.config.annotationFilters.length > 0) {
      const annotations = resource.metadata.annotations || {};
      const hasMatchingAnnotation = this.config.annotationFilters.some(filter => {
        const [key, value] = filter.split('=');
        return annotations[key] === value;
      });
      
      if (!hasMatchingAnnotation) return false;
    }

    return true;
  }

  /**
   * Normalize Kubernetes resource to standard format
   */
  async normalizeResource(resource) {
    const messageQueueType = this.detectMessageQueueType(resource);
    
    return {
      id: this.generateResourceId(resource),
      type: messageQueueType || 'unknown',
      provider: 'kubernetes',
      metadata: {
        name: resource.metadata.name,
        namespace: resource.metadata.namespace,
        labels: resource.metadata.labels || {},
        annotations: resource.metadata.annotations || {},
        uid: resource.metadata.uid,
        resourceVersion: resource.metadata.resourceVersion,
        creationTimestamp: resource.metadata.creationTimestamp
      },
      config: this.extractConfig(resource),
      status: this.extractStatus(resource),
      endpoints: this.extractEndpoints(resource),
      raw: resource
    };
  }

  /**
   * Detect message queue type from resource
   */
  detectMessageQueueType(resource) {
    // Check labels
    const labels = resource.metadata.labels || {};
    for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
      for (const labelPattern of patterns.labels) {
        const [key, value] = labelPattern.split('=');
        if (labels[key] === value) {
          return type;
        }
      }
    }

    // Check container images
    if (resource.spec && resource.spec.containers) {
      for (const container of resource.spec.containers) {
        for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
          for (const imagePattern of patterns.images) {
            if (container.image && container.image.includes(imagePattern)) {
              return type;
            }
          }
        }
      }
    }

    // Check template spec for deployments/statefulsets
    if (resource.spec && resource.spec.template && resource.spec.template.spec) {
      const containers = resource.spec.template.spec.containers || [];
      for (const container of containers) {
        for (const [type, patterns] of Object.entries(this.messageQueuePatterns)) {
          for (const imagePattern of patterns.images) {
            if (container.image && container.image.includes(imagePattern)) {
              return type;
            }
          }
        }
      }
    }

    // Check ports
    const ports = this.extractPorts(resource);
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
   * Extract configuration from resource
   */
  extractConfig(resource) {
    const config = {
      kind: resource.kind,
      replicas: this.extractReplicas(resource),
      ports: this.extractPorts(resource),
      volumes: this.extractVolumes(resource),
      env: this.extractEnvVars(resource)
    };

    // Extract service-specific config
    if (resource.kind === 'Service') {
      config.clusterIP = resource.spec.clusterIP;
      config.type = resource.spec.type;
      config.sessionAffinity = resource.spec.sessionAffinity;
    }

    return config;
  }

  /**
   * Extract status from resource
   */
  extractStatus(resource) {
    const status = {
      phase: 'unknown',
      conditions: [],
      ready: false
    };

    if (resource.status) {
      if (resource.kind === 'Pod') {
        status.phase = resource.status.phase;
        status.conditions = resource.status.conditions || [];
        status.ready = resource.status.phase === 'Running';
      } else if (resource.kind === 'Deployment' || resource.kind === 'StatefulSet') {
        status.replicas = resource.status.replicas || 0;
        status.readyReplicas = resource.status.readyReplicas || 0;
        status.ready = status.replicas === status.readyReplicas;
        status.conditions = resource.status.conditions || [];
      }
    }

    return status;
  }

  /**
   * Extract endpoints from resource
   */
  extractEndpoints(resource) {
    const endpoints = [];
    const ports = this.extractPorts(resource);
    
    if (resource.kind === 'Service') {
      const serviceName = resource.metadata.name;
      const namespace = resource.metadata.namespace;
      
      for (const port of ports) {
        endpoints.push({
          type: 'service',
          url: `${serviceName}.${namespace}.svc.cluster.local:${port}`,
          port: port
        });
      }
      
      // Add external endpoints if available
      if (resource.spec.type === 'LoadBalancer' && resource.status.loadBalancer) {
        const ingress = resource.status.loadBalancer.ingress || [];
        for (const ing of ingress) {
          const host = ing.hostname || ing.ip;
          if (host) {
            for (const port of ports) {
              endpoints.push({
                type: 'external',
                url: `${host}:${port}`,
                port: port
              });
            }
          }
        }
      }
    }

    return endpoints;
  }

  /**
   * Extract replicas from resource
   */
  extractReplicas(resource) {
    if (resource.spec && resource.spec.replicas !== undefined) {
      return resource.spec.replicas;
    }
    if (resource.spec && resource.spec.template && resource.spec.template.spec) {
      return 1; // Default for single pod
    }
    return 0;
  }

  /**
   * Extract ports from resource
   */
  extractPorts(resource) {
    const ports = [];
    
    // Service ports
    if (resource.spec && resource.spec.ports) {
      for (const port of resource.spec.ports) {
        ports.push(port.port);
      }
    }
    
    // Container ports
    const containers = this.getContainers(resource);
    for (const container of containers) {
      if (container.ports) {
        for (const port of container.ports) {
          ports.push(port.containerPort);
        }
      }
    }
    
    return [...new Set(ports)]; // Remove duplicates
  }

  /**
   * Extract volumes from resource
   */
  extractVolumes(resource) {
    const spec = resource.spec || (resource.spec && resource.spec.template && resource.spec.template.spec);
    return spec && spec.volumes ? spec.volumes.map(v => v.name) : [];
  }

  /**
   * Extract environment variables
   */
  extractEnvVars(resource) {
    const envVars = {};
    const containers = this.getContainers(resource);
    
    for (const container of containers) {
      if (container.env) {
        for (const env of container.env) {
          envVars[env.name] = env.value || '<configmap/secret>';
        }
      }
    }
    
    return envVars;
  }

  /**
   * Get containers from resource
   */
  getContainers(resource) {
    if (resource.spec && resource.spec.containers) {
      return resource.spec.containers;
    }
    if (resource.spec && resource.spec.template && resource.spec.template.spec) {
      return resource.spec.template.spec.containers || [];
    }
    return [];
  }

  /**
   * Generate unique resource ID
   */
  generateResourceId(resource) {
    return `k8s:${resource.metadata.namespace}:${resource.kind}:${resource.metadata.name}`;
  }

  /**
   * Check if resource is a message queue system
   */
  isMessageQueueResource(resource) {
    return resource.type !== 'unknown' && resource.type !== null;
  }
}

module.exports = KubernetesDiscoveryProvider;