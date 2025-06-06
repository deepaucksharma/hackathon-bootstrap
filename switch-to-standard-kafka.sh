#!/bin/bash
echo "🔄 Switching to Standard Kafka Integration"
echo "=========================================="
echo ""
echo "This will make your Kafka cluster appear in the Message Queues UI"
echo "as a standard Kafka cluster (not AWS MSK)."
echo ""

# Create the updated configuration
cat > minikube-consolidated/monitoring/04-daemonset-bundle-standard.yaml << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: nri-kafka-config
  namespace: newrelic
data:
  nri-kafka-config.yml: |
    integrations:
      - name: nri-kafka
        env:
          CLUSTER_NAME: minikube-kafka
          AUTODISCOVER_STRATEGY: bootstrap
          BOOTSTRAP_BROKER_HOST: kafka-0.kafka-headless.kafka.svc.cluster.local
          BOOTSTRAP_BROKER_KAFKA_PORT: 9092
          BOOTSTRAP_BROKER_JMX_PORT: 9999
          DEFAULT_JMX_PORT: 9999
          METRICS: "true"
          INVENTORY: "true"
          COLLECT_BROKER_TOPIC_DATA: "true"
          COLLECT_TOPIC_SIZE: "true"
          COLLECT_TOPIC_OFFSET: "true"
          TOPIC_MODE: "all"
          CONSUMER_OFFSET: "true"
          CONSUMER_GROUP_REGEX: ".*"
          TIMEOUT: "30000"
          
          # Producer and Consumer collection
          PRODUCERS: '[{"host": "10.244.0.27", "port": 9995}]'
          CONSUMERS: '[{"host": "10.244.0.28", "port": 9996}]'
          DEFAULT_JMX_HOST: "localhost"
          DEFAULT_JMX_PORT: 9999
          
          # DISABLE MSK Shim - Use Standard Kafka
          MSK_SHIM_ENABLED: "false"
          MSK_USE_DIMENSIONAL: "false"
          
        interval: 30s
        timeout: 30s
        inventory_source: config/kafka
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nri-kafka-bundle
  namespace: newrelic
  labels:
    app: nri-kafka-bundle
spec:
  selector:
    matchLabels:
      app: nri-kafka-bundle
  template:
    metadata:
      labels:
        app: nri-kafka-bundle
    spec:
      serviceAccountName: nri-kafka
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      containers:
      - name: nri-kafka
        image: nri-kafka-msk:latest
        imagePullPolicy: Never
        securityContext:
          privileged: true
        env:
        - name: NRIA_LICENSE_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-credentials
              key: license-key
        - name: NRIA_VERBOSE
          value: "1"
        - name: NRIA_LOG_LEVEL
          value: "debug"
        - name: NRIA_OVERRIDE_HOSTNAME_SHORT
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        - name: NRIA_CUSTOM_ATTRIBUTES
          value: '{"clusterName":"minikube","environment":"development"}'
        - name: DISABLE_KUBE_STATE_METRICS
          value: "true"
        - name: NEW_RELIC_METADATA_KUBERNETES_CLUSTER_NAME
          value: "minikube"
        - name: NEW_RELIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-credentials
              key: user-key
        volumeMounts:
        - name: config
          mountPath: /etc/newrelic-infra/integrations.d/
        - name: host-docker-socket
          mountPath: /var/run/docker.sock
        - name: log
          mountPath: /var/log
        - name: host-var-cache-nr-integration
          mountPath: /var/cache/nr-integration
        - name: host-var-db-newrelic-infra
          mountPath: /var/db/newrelic-infra/
        resources:
          limits:
            memory: 1Gi
          requests:
            cpu: 100m
            memory: 200Mi
      volumes:
      - name: config
        configMap:
          name: nri-kafka-config
          items:
          - key: nri-kafka-config.yml
            path: kafka-config.yml
      - name: host-docker-socket
        hostPath:
          path: /var/run/docker.sock
      - name: log
        hostPath:
          path: /var/log
      - name: host-var-cache-nr-integration
        hostPath:
          path: /var/cache/nr-integration
      - name: host-var-db-newrelic-infra
        hostPath:
          path: /var/db/newrelic-infra/
EOF

echo "✅ Configuration file created: minikube-consolidated/monitoring/04-daemonset-bundle-standard.yaml"
echo ""
echo "📋 To apply this configuration:"
echo "kubectl apply -f minikube-consolidated/monitoring/04-daemonset-bundle-standard.yaml"
echo ""
echo "🎯 Expected Result:"
echo "- Your Kafka cluster will appear in Message Queues UI"
echo "- It will show as 'Kafka' (not AWS MSK)"
echo "- All standard Kafka metrics will be available"
echo ""
echo "⏱️ Note: It may take 2-5 minutes for entities to appear in the UI"