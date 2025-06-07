import {
  MSK_PROVIDER,
  CONFLUENT_CLOUD_PROVIDER,
  MSK_PROVIDER_POLLING,
} from '../config/constants';

import {
  getQueryByProviderAndPreference,
  getClusterGroupWhereCond,
  getQueryString,
  TOTAL_CLUSTERS_QUERY,
  getTopicsTableQuery,
  getConditionFilters,
} from './query-utils';

describe('getQueryByProviderAndPreference', () => {
  const mockFilterSet = [
    "(aws.kafka.ClusterName or aws.msk.clusterName) IN ('mike-test-cluster')",
    "(aws.msk.brokerId or aws.kafka.BrokerID) IN ('2')",
    "(aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets')",
  ];
  const mockFacet = ['facet1', 'facet2'];
  const mockTimeRange = { begin_time: 1234567890, end_time: 1234567990 };
  const mockStaticInfo = {
    unhealthyClusters:
      'filter(datapointCount(), WHERE `Offline Partitions` > 0)',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a query for MSK provider with metric streams', () => {
    const result = getQueryByProviderAndPreference(
      true, // isPreferMetrics
      MSK_PROVIDER,
      'total_clusters',
      mockFilterSet,
      mockFacet,
      mockTimeRange,
      mockStaticInfo,
    );

    expect(result).toBe(
      "SELECT filter(uniqueCount(`aws.kafka.ClusterName` OR `aws.msk.clusterName`), where entity.type like '%CLUSTER%' AND (`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT uniques(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where (aws.msk.brokerId or aws.kafka.BrokerID) IN ('2') AND (aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets') AND (aws.kafka.ClusterName or aws.msk.clusterName) IN ('mike-test-cluster'))) as 'Total clusters' FROM Metric",
    );
  });

  it('should generate a query for Confluent Cloud provider with polling', () => {
    const result = getQueryByProviderAndPreference(
      false, // isPreferMetrics
      CONFLUENT_CLOUD_PROVIDER,
      'topics',
      mockFilterSet,
      mockFacet,
      mockTimeRange,
      mockStaticInfo,
    );

    expect(result).toBe(
      "SELECT uniqueCount(displayName) as 'Topics' FROM Metric WHERE ((aws.kafka.ClusterName or aws.msk.clusterName) IN ('mike-test-cluster') AND (aws.msk.brokerId or aws.kafka.BrokerID) IN ('2') AND (aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets') AND metricName like '%confluent%' and entity.type like '%CONFLUENTCLOUDKAFKATOPIC%')",
    );
  });

  it('should generate a query for MSK provider with polling', () => {
    const result = getQueryByProviderAndPreference(
      false, // isPreferMetrics
      MSK_PROVIDER,
      'brokers',
      mockFilterSet,
      mockFacet,
      mockTimeRange,
      mockStaticInfo,
    );

    expect(result).toBe(
      "SELECT uniqueCount(tuple(provider.clusterName,provider.brokerId)) as 'Brokers' FROM AwsMskBrokerSample WHERE (provider.clusterName IN (SELECT uniques(provider.clusterName) from AwsMskTopicSample where (aws.kafka.ClusterName or aws.msk.clusterName) IN ('mike-test-cluster') AND (aws.msk.brokerId or aws.kafka.BrokerID) IN ('2') AND (aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets'))) LIMIT MAX",
    );
  });

  it('should handle an empty filterSet gracefully', () => {
    const result = getQueryByProviderAndPreference(
      true, // isPreferMetrics
      MSK_PROVIDER,
      'partitions_count',
      [],
      mockFacet,
      mockTimeRange,
      mockStaticInfo,
    );

    expect(result).toBe(
      "SELECT sum(`partitions`) as 'Partitions' FROM (SELECT round(average(aws.kafka.GlobalPartitionCount)) as 'partitions' FROM Metric FACET `aws.kafka.ClusterName` OR `aws.msk.clusterName` LIMIT MAX)",
    );
  });

  it('should handle an empty facet array gracefully', () => {
    const result = getQueryByProviderAndPreference(
      true, // isPreferMetrics
      MSK_PROVIDER,
      'total_clusters',
      mockFilterSet,
      [],
      mockTimeRange,
      mockStaticInfo,
    );

    expect(result).toBe(
      "SELECT filter(uniqueCount(`aws.kafka.ClusterName` OR `aws.msk.clusterName`), where entity.type like '%CLUSTER%' AND (`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT uniques(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where (aws.msk.brokerId or aws.kafka.BrokerID) IN ('2') AND (aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets') AND (aws.kafka.ClusterName or aws.msk.clusterName) IN ('mike-test-cluster'))) as 'Total clusters' FROM Metric",
    );
  });
});

describe('getQueryString - MSK_PROVIDER logic', () => {
  it('should handle whereVal with "aws.msk.brokerId or aws.kafka.BrokerID" for MSK_PROVIDER', () => {
    const mockQueryDefinition = {
      from: 'Metric',
      select:
        "filter(uniqueCount(tuple((`aws.kafka.ClusterName` OR `aws.msk.clusterName`), (`aws.kafka.BrokerID` OR `aws.msk.brokerId`))) , WHERE metricName like 'aws.kafka%byBroker') as 'Brokers'",
      metricType: 'Broker',
      where: [
        "(aws.kafka.ClusterName or aws.msk.clusterName) IN ('mike-test-cluster')",
        "(aws.msk.brokerId or aws.kafka.BrokerID) IN ('2')",
        "(aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets')",
      ],
    };

    const filterSet = [
      "(aws.kafka.ClusterName or aws.msk.clusterName) IN ('mike-test-cluster')",
      "(aws.msk.brokerId or aws.kafka.BrokerID) IN ('2')",
      "(aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets')",
    ];

    const result = getQueryString(
      mockQueryDefinition,
      MSK_PROVIDER,
      false,
      filterSet,
    );
    expect(result).toContain(
      "SELECT filter(uniqueCount(tuple((`aws.kafka.ClusterName` OR `aws.msk.clusterName`), (`aws.kafka.BrokerID` OR `aws.msk.brokerId`))) , WHERE metricName like 'aws.kafka%byBroker') as 'Brokers' FROM Metric WHERE ( (aws.kafka.ClusterName or aws.msk.clusterName) IN ('mike-test-cluster') AND (aws.msk.brokerId or aws.kafka.BrokerID) IN ('2') AND (`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT uniques(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where (aws.msk.brokerId or aws.kafka.BrokerID) IN ('2') AND  (aws.kafka.Topic OR aws.msk.topic) IN ('__consumer_offsets')))",
    );
  });

  it('should handle whereVal with provider.clusterName,provider.brokerId,provider.topic  for MSK_PROVIDER_POLLING AwsMskClusterSample', () => {
    const mockQueryDefinition = {
      select: "uniqueCount(provider.clusterName) as  'Total clusters'",
      from: 'AwsMskClusterSample',
      where: [
        "(provider.clusterName) IN ('demo-cluster-1')",
        "(provider.brokerId) IN ('2')",
        "(provider.topic) IN ('__consumer_offsets')",
      ],
      orderBy: 'provider.clusterName',
    };

    const filterSet = [
      "(provider.clusterName) IN ('demo-cluster-1')",
      "(provider.brokerId) IN ('2')",
      "(provider.topic) IN ('__consumer_offsets')",
    ];

    const result = getQueryString(
      mockQueryDefinition,
      MSK_PROVIDER_POLLING,
      false,
      filterSet,
    );
    expect(result).toContain(
      "SELECT uniqueCount(provider.clusterName) as  'Total clusters' FROM AwsMskClusterSample WHERE (provider.clusterName IN (SELECT uniques(provider.clusterName) from AwsMskTopicSample where (provider.clusterName) IN ('demo-cluster-1') AND (provider.brokerId) IN ('2') AND (provider.topic) IN ('__consumer_offsets')))",
    );
  });

  it('should handle whereVal with provider.clusterName,provider.brokerId,provider.topic for MSK_PROVIDER_POLLING AwsMskBrokerSample', () => {
    const mockQueryDefinition = {
      select: [
        "uniqueCount(tuple(provider.clusterName,provider.brokerId)) as 'Brokers'",
      ],
      from: 'AwsMskBrokerSample',
      alias: 'Brokers',
      limit: 'MAX',
      where: [
        "(provider.clusterName) IN ('demo-cluster-1')",
        "(provider.brokerId) IN ('2')",
        "(provider.topic) IN ('__consumer_offsets')",
      ],
    };

    const filterSet = [
      "(provider.clusterName) IN ('demo-cluster-1')",
      "(provider.brokerId) IN ('2')",
      "(provider.topic) IN ('__consumer_offsets')",
    ];

    const result = getQueryString(
      mockQueryDefinition,
      MSK_PROVIDER_POLLING,
      false,
      filterSet,
    );
    expect(result).toContain(
      "SELECT uniqueCount(tuple(provider.clusterName,provider.brokerId)) as 'Brokers' FROM AwsMskBrokerSample WHERE ((provider.brokerId) IN ('2') AND provider.clusterName IN (SELECT uniques(provider.clusterName) from AwsMskTopicSample where (provider.clusterName) IN ('demo-cluster-1') AND (provider.brokerId) IN ('2') AND (provider.topic) IN ('__consumer_offsets'))) LIMIT MAX",
    );
  });
});

describe('TOTAL_CLUSTERS_QUERY', () => {
  it('should return the correct query for MSK_PROVIDER with metric streams', () => {
    const result = TOTAL_CLUSTERS_QUERY(MSK_PROVIDER, true);

    expect(result).toEqual({
      select: `uniqueCount(aws.kafka.ClusterName OR aws.msk.clusterName) as 'Total clusters'`,
      from: 'Metric',
      where: ["(metricName like 'aws.kafka%byTopic')"],
    });
  });

  it('should return the correct query for MSK_PROVIDER with polling', () => {
    const result = TOTAL_CLUSTERS_QUERY(MSK_PROVIDER, false);

    expect(result).toEqual({
      select: `uniqueCount(provider.clusterName) as 'Total clusters'`,
      from: 'AwsMskClusterSample',
    });
  });

  it('should return the correct query for CONFLUENT_CLOUD_PROVIDER', () => {
    const result = TOTAL_CLUSTERS_QUERY(CONFLUENT_CLOUD_PROVIDER, true);

    expect(result).toEqual({
      select: `uniqueCount(kafka.cluster_name or kafka.clusterName or confluent.clusterName) as 'Total clusters'`,
      from: 'Metric',
      where: ["metricName like '%confluent%'"],
      metricType: 'Cluster',
    });
  });

  it('should return an empty object for an unsupported provider', () => {
    const result = TOTAL_CLUSTERS_QUERY('UNSUPPORTED_PROVIDER', true);

    expect(result).toEqual({});
  });

  it('should return undefined for an unsupported queryKey', () => {
    const queryKey = 'unsupported_query_key';
    const orderBy = 'bytesInPerSec';
    const where = ['`provider.topic` IS NOT NULL'];

    const mockAttributeSortMapping = {
      bytesInPerSec: 'bytesInPerSec',
      bytesOutPerSec: 'bytesOutPerSec',
      messagesInPerSec: 'messagesInPerSec',
    };

    const result = getTopicsTableQuery(
      queryKey,
      orderBy,
      where,
      mockAttributeSortMapping,
    );

    expect(result).toBeUndefined();
  });
});

describe('getConditionFilters', () => {
  it('should return the condition wrapped in parentheses when the key exists in filtersApplied', () => {
    const filtersApplied = {
      cluster: "`aws.kafka.ClusterName` IN ('Cluster1')",
      broker: "`aws.kafka.BrokerID` IN ('Broker1')",
    };
    const key = 'cluster';

    const result = getConditionFilters(filtersApplied, key);

    expect(result).toBe("(`aws.kafka.ClusterName` IN ('Cluster1'))");
  });

  it('should return an empty string when the key does not exist in filtersApplied', () => {
    const filtersApplied = {
      cluster: "`aws.kafka.ClusterName` IN ('Cluster1')",
      broker: "`aws.kafka.BrokerID` IN ('Broker1')",
    };
    const key = 'topic';

    const result = getConditionFilters(filtersApplied, key);

    expect(result).toBe('');
  });

  it('should return an empty string when filtersApplied is empty', () => {
    const filtersApplied = {};
    const key = 'cluster';

    const result = getConditionFilters(filtersApplied, key);

    expect(result).toBe('');
  });

  it('should handle null or undefined filtersApplied gracefully', () => {
    const key = 'cluster';

    const resultWithNull = getConditionFilters(
      {
        cluster: null,
      },
      key,
    );
    const resultWithUndefined = getConditionFilters(
      {
        cluster: undefined,
      },
      key,
    );

    expect(resultWithNull).toBe('');
    expect(resultWithUndefined).toBe('');
  });

  it('should handle an empty string value for the key in filtersApplied', () => {
    const filtersApplied = {
      cluster: '',
    };
    const key = 'cluster';

    const result = getConditionFilters(filtersApplied, key);

    expect(result).toBe('');
  });

  it('return getClusterGroupWhereCond with topic condition', () => {
    const value = getClusterGroupWhereCond([
      "aws.kafka.Topic OR aws.msk.topic IN ('Topic1')",
      "`aws.kafka.BrokerID` IN ('Broker1')",
    ]);

    const normalizeString = (str) => str.replace(/\s+/g, ' ').trim();

    // Normalize the formatting of both the actual and expected strings
    const expectedValue =
      "WHERE ((`aws.kafka.ClusterName` OR `aws.msk.clusterName`) in (SELECT (`aws.kafka.ClusterName` OR `aws.msk.clusterName`) from Metric where (aws.kafka.Topic OR aws.msk.topic IN ('Topic1')) AND (`aws.kafka.BrokerID` IN ('Broker1')) LIMIT MAX))";

    expect(normalizeString(value)).toBe(normalizeString(expectedValue));
  });
});
