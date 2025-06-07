import {
  getAwsStreamWhere,
  confluentCloudTopicWhereCond,
  CLUSTER_COLUMNS_MAPPING,
  MSK_PROVIDER,
  CONFLUENT_CLOUD_PROVIDER,
  getConditionMapping,
} from './constants';

describe('getAwsStreamWhere', () => {
  it('should return the correct query for Cluster metricType with brokerId 3 filtered', () => {
    const result = getAwsStreamWhere(
      'Cluster',
      'aws.msk.brokerId or aws.kafka.BrokerID',
      "(aws.msk.brokerId or aws.kafka.BrokerID) IN ('3')",
      false,
    );
    expect(result).toBe(
      "(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT uniques(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where (aws.msk.brokerId or aws.kafka.BrokerID) IN ('3'))",
    );
  });

  it('should return the correct query for Topic metricType with brokerId 3 filtered', () => {
    const result = getAwsStreamWhere(
      'Topic',
      'aws.msk.brokerId or aws.kafka.BrokerID',
      "(aws.msk.brokerId or aws.kafka.BrokerID) IN ('3')",
      false,
    );
    expect(result).toBe("(aws.msk.brokerId or aws.kafka.BrokerID) IN ('3')");
  });

  it('should return the correct query for Cluster metricType with topic __consumer_offsets filtered', () => {
    const result = getAwsStreamWhere(
      'Cluster',
      'aws.kafka.Topic OR aws.msk.topic',
      "(aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets')",
      true,
    );
    expect(result).toBe(
      "(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT (`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where (aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets') LIMIT MAX)",
    );
  });

  it('should return the whereCond for Cluster metricType with an unknown keyName', () => {
    const result = getAwsStreamWhere('Cluster', 'unknownKey', 'key = value');
    expect(result).toBe('key = value');
  });

  it('should return the correct query for Broker metricType with topic __consumer_offsets filtered', () => {
    const result = getAwsStreamWhere(
      'Broker',
      'aws.kafka.Topic OR aws.msk.topic',
      "(aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets')",
      false,
    );
    expect(result).toBe(
      "(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT uniques(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where (aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets'))",
    );
  });

  it('should return the whereCond for Broker metricType with an unknown keyName', () => {
    const result = getAwsStreamWhere('Broker', 'unknownKey', 'key = value');
    expect(result).toBe('key = value');
  });

  it('should return the whereCond for unknown metricType', () => {
    const result = getAwsStreamWhere(
      'Unknown',
      'aws.kafka.Topic',
      'key = value',
    );
    expect(result).toBe('key = value');
  });

  it('should handle isNavigator flag correctly for Cluster metricType', () => {
    const result = getAwsStreamWhere(
      'Cluster',
      'aws.kafka.Topic',
      'key = value',
      true,
    );
    expect(result).toBe(
      '(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT (`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where key = value LIMIT MAX)',
    );
  });

  it('should handle isNavigator flag correctly for Broker metricType', () => {
    const result = getAwsStreamWhere(
      'Broker',
      'aws.kafka.Topic',
      'key = value',
      true,
    );
    expect(result).toBe(
      '(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT (`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where key = value LIMIT MAX)',
    );
  });
});

describe('confluentCloudTopicWhereCond', () => {
  it('should return the original whereCond if it includes "metricName like \'%confluent%\'"', () => {
    const whereCond = "metricName like '%confluent%'";
    const result = confluentCloudTopicWhereCond(whereCond, false, {
      metricType: 'Cluster',
    });
    expect(result).toBe(whereCond);
  });

  it('should return the correct whereClause for Cluster metricType without isNavigator filtered with fdn_test_confluent_cloud_cluster', () => {
    const whereCond =
      "(kafka.cluster_name or kafka.clusterName or confluent.clusterName) IN ('fdn_test_confluent_cloud_cluster')";
    const result = confluentCloudTopicWhereCond(whereCond, false, {
      metricType: 'Cluster',
    });
    expect(result).toBe(
      "(`kafka.cluster_name` OR `kafka.clusterName` OR `confluent.clusterName`) in (SELECT uniques(`kafka.cluster_name` OR `kafka.clusterName` OR `confluent.clusterName`) FROM Metric where (kafka.cluster_name or kafka.clusterName or confluent.clusterName) IN ('fdn_test_confluent_cloud_cluster'))",
    );
  });

  it('should return the correct whereClause for Cluster metricType with isNavigator filtered with fdn_test_confluent_cloud_cluster', () => {
    const whereCond =
      "(kafka.cluster_name or kafka.clusterName or confluent.clusterName) IN ('fdn_test_confluent_cloud_cluster')";
    const result = confluentCloudTopicWhereCond(whereCond, true, {
      metricType: 'Cluster',
    });
    expect(result).toBe(
      "(`kafka.cluster_name` OR `kafka.clusterName` OR `confluent.clusterName`) in (SELECT (`kafka.cluster_name` OR `kafka.clusterName` OR `confluent.clusterName`) FROM Metric where (kafka.cluster_name or kafka.clusterName or confluent.clusterName) IN ('fdn_test_confluent_cloud_cluster') LIMIT MAX)",
    );
  });

  it('should append the whereClause for Topic metricType without isNavigator filtered with order-created', () => {
    const whereCond =
      "(topic or confluent.kafka.server.metric.topic) IN ('order-created')";
    const result = confluentCloudTopicWhereCond(whereCond, false, {
      metricType: 'Topic',
    });
    expect(result).toBe(
      "(topic or confluent.kafka.server.metric.topic) IN ('order-created') AND (`kafka.cluster_name` OR `kafka.clusterName` OR `confluent.clusterName`) in (SELECT uniques(`kafka.cluster_name` OR `kafka.clusterName` OR `confluent.clusterName`) FROM Metric where (topic or confluent.kafka.server.metric.topic) IN ('order-created'))",
    );
  });

  it('should append the whereClause for Topic metricType with isNavigator filtered with order-created', () => {
    const whereCond =
      "(topic or confluent.kafka.server.metric.topic) IN ('order-created')";
    const result = confluentCloudTopicWhereCond(whereCond, true, {
      metricType: 'Topic',
    });
    expect(result).toBe(
      "(topic or confluent.kafka.server.metric.topic) IN ('order-created') AND (`kafka.cluster_name` OR `kafka.clusterName` OR `confluent.clusterName`) in (SELECT (`kafka.cluster_name` OR `kafka.clusterName` OR `confluent.clusterName`) FROM Metric where (topic or confluent.kafka.server.metric.topic) IN ('order-created') LIMIT MAX)",
    );
  });
});

describe('CLUSTER_COLUMNS_MAPPING', () => {
  it('should return "provider.clusterName" for MSK provider when metricStream is false', () => {
    const result = CLUSTER_COLUMNS_MAPPING(false, MSK_PROVIDER);
    expect(result).toBe('provider.clusterName');
  });

  it('should return "`aws.kafka.ClusterName` OR `aws.msk.clusterName`" for MSK provider when metricStream is true', () => {
    const result = CLUSTER_COLUMNS_MAPPING(true, MSK_PROVIDER);
    expect(result).toBe('`aws.kafka.ClusterName` OR `aws.msk.clusterName`');
  });

  it('should return "`kafka.cluster_name` or `kafka.clusterName` or `confluent.clusterName`" for ConfluentCloud provider', () => {
    const result = CLUSTER_COLUMNS_MAPPING(false, CONFLUENT_CLOUD_PROVIDER);
    expect(result).toBe(
      '`kafka.cluster_name` or `kafka.clusterName` or `confluent.clusterName`',
    );
  });

  it('should return an empty string for unknown provider', () => {
    const result = CLUSTER_COLUMNS_MAPPING(false, 'UnknownProvider');
    expect(result).toBe('');
  });
});

describe('getConditionMapping', () => {
  it('should return true for AwsMskClusterSample with keyName "provider.brokerId"', () => {
    const result = getConditionMapping('provider.brokerId');
    expect(result.AwsMskClusterSample).toBe(true);
    expect(result.AwsMskBrokerSample).toBe(false);
    expect(result.Metric).toBe(false);
  });

  it('should return true for AwsMskClusterSample with keyName "provider.topic"', () => {
    const result = getConditionMapping('provider.topic');
    expect(result.AwsMskClusterSample).toBe(true);
    expect(result.AwsMskBrokerSample).toBe(true);
    expect(result.Metric).toBe(false);
  });

  it('should return true for Metric with keyName "metricName"', () => {
    const result = getConditionMapping('metricName');
    expect(result.AwsMskClusterSample).toBe(false);
    expect(result.AwsMskBrokerSample).toBe(false);
    expect(result.Metric).toBe(true);
  });

  it('should return false for all conditions with an unknown keyName', () => {
    const result = getConditionMapping('unknownKey');
    expect(result.AwsMskClusterSample).toBe(false);
    expect(result.AwsMskBrokerSample).toBe(false);
    expect(result.Metric).toBe(false);
  });
});
