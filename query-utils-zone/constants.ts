import { Filter } from '@datanerd/shared-component-filter-bar/dist/common/types';

export const PROVIDERS_ID_MAP: any = {
  'AWS MSK': 'aws',
  'Confluent Cloud': 'confluent_cloud',
};

export const MSK_PROVIDER = 'AWS MSK';
export const CONFLUENT_CLOUD_PROVIDER = 'Confluent Cloud';

export const MSK_PROVIDER_POLLING = 'AWS MSK SAMPLE';

export const LIMIT_20 = '20';
export const MAX_LIMIT = 'MAX';

export enum METRIC_IDS {
  SUMMARY = 'summary',
  TOTAL_CLUSTERS = 'total_clusters',
  UNHEALTHY_CLUSTERS = 'unhealthy_clusters',
  TOPICS = 'topics',
  BROKERS = 'brokers',
  PARTITIONS_COUNT = 'partitions_count',
  BROKER_COUNT_BY_CLUSTER = 'broker_count_by_cluster',
  INCOMING_THROUGHPUT_BY_TOPIC = 'incoming_throughput_by_topic',
  TOTAL_PARTITIONS = 'total_partitions',
  MEAN_THROUGHPUT_PER_PARTITION = 'mean_throughput_per_partitions',
  CLUSTER_LOAD_PERCENT = 'cluster_load_percent',
  PARTITIONS_COUNT_BY_CLUSTER = 'partitions_count_by_cluster',
  TOTAL_PRODUCED_THROUGHPUT = 'total_produced_throughput',
  MESSAGES_PRODUCED_RATE = 'messages_produced_rate',
  THROUGHPUT_BY_CLUSTER = 'throughput_by_cluster',
  INCOMING_THROUGHPUT_BY_TOPIC_TIMESERIES = 'incoming_throughput_by_topic_timeseries',
  OUTGOING_THROUGHPUT_BY_TOPIC_TIMESERIES = 'outgoing_throughput_by_topic_timeseries',
  THROUGHPUT_DEVIATION_BY_TOPIC_TIMESERIES = 'throughput_deviation_by_topic_timeseries',
  INCOMING_MESSAGE_RATE_BY_TOPIC_TIMESERIES = 'incoming_message_rate_by_topic_timeseries',
  OUTGOING_MESSAGE_RATE_BY_TOPIC_TIMESERIES = 'outgoing_message_rate_by_topic_timeseries',
  TOPIC_COUNT_BY_CLUSTER = 'topic_count_by_cluster',
}

export const METRIC_TAG_ATTRIBUTES = [
  'tags.component',
  'tags.department',
  'tags.environment',
  'tags.Name',
  'tags.owning_team',
  'tags.product',
  'tags.cell_type',
  'tags.tls_mode',
  'tags.service_name',
  'tags.cell_name',
];

export const DEFAULT_METRIC_VALUE = -1;

export const TOOLTIP_CLUSTER_METRICS_UNAVAILABLE = `Basic tier clusters doesn't support cluster load percent metric`;

export const CLUSTERS_NOT_AVAILABLE =
  'Some clusters linked to this account are not reporting, which may lead to inconsistencies in the total cluster count.';

export const SUMMARY_PAGE_CHART_LABELS = [
  'Clusters',
  'Unhealthy Clusters',
  'Total Topics',
  'Active Topics',
  'Partitions',
  'Brokers',
];

export const MESSAGE_QUEUE_TYPE = 'Kafka';

export const HIDDEN_FILTERS =
  "metricName like '%aws.kafka%' or metricName like '%confluent%' or provider IN ('AwsMskCluster', 'AwsMskBroker', 'AwsMskTopic')";

export const AWS_POLLING_HIDDEN_FILTERS_CONDITION =
  "provider IN ('AwsMskCluster', 'AwsMskBroker', 'AwsMskTopic')";

export const AWS_METRIC_HIDDEN_FILTERS_CONDITION =
  "metricName like '%aws.kafka%'";

export const CONFLUENT_HIDDEN_FILTERS_CONDITION =
  "metricName like '%confluent%'";

export const EVENT_TYPES = [
  'Metric',
  'AwsMskBrokerSample',
  'AwsMskClusterSample',
  'AwsMskTopicSample',
];

export const AWS_MSK_EVENT_TYPES = [
  'AwsMskBrokerSample',
  'AwsMskClusterSample',
  'AwsMskTopicSample',
];

export const METRIC_EVENT_TYPES = ['Metric'];

export const confluentCloudTopicWhereCond = (
  whereCond: string,
  isNavigator = false,
  queryDefinition: any,
) => {
  let whereClause = whereCond;

  if (!whereCond.includes("metricName like '%confluent%'")) {
    whereClause = `(\`kafka.cluster_name\` OR \`kafka.clusterName\` OR \`confluent.clusterName\`) in (SELECT ${isNavigator ? '' : 'uniques'}(\`kafka.cluster_name\` OR \`kafka.clusterName\` OR \`confluent.clusterName\`) FROM Metric where ${whereCond}${isNavigator ? ' LIMIT MAX' : ''})`;

    if (queryDefinition.metricType === 'Topic') {
      whereClause = `${whereCond} AND ${whereClause}`;
    }
  }
  return whereClause;
};

export const keyMapping: { [key: string]: string } = {
  AwsMskClusterSample: 'provider.clusterName',
  AwsMskBrokerSample: 'provider.clusterName',
  AwsMskTopicSample: 'provider.topic',
};

export const getConditionMapping = (keyName: string) => {
  const conditionMapping: { [key: string]: boolean } = {
    AwsMskClusterSample:
      keyName === 'provider.brokerId' || keyName === 'provider.topic'
        ? true
        : false,
    AwsMskBrokerSample: keyName === 'provider.topic' ? true : false,
    Metric: keyName === 'metricName' ? true : false,
  };
  return conditionMapping;
};

const getClusterFilterCondition = (isNavigator: boolean, whereCond: string) => {
  return `(\`aws.msk.clusterName\` OR \`aws.kafka.ClusterName\`) IN (SELECT ${isNavigator ? '' : 'uniques'}(\`aws.msk.clusterName\` OR \`aws.kafka.ClusterName\`) FROM Metric where ${whereCond}${isNavigator ? ' LIMIT MAX' : ''})`;
};

export const getAwsStreamWhere = (
  metricType: string,
  keyName: string,
  whereCond: string,
  isNavigator = false,
) => {
  if (METRIC_TAG_ATTRIBUTES.includes(keyName)) {
    return getClusterFilterCondition(isNavigator, whereCond);
  } else if (metricType === 'Cluster') {
    if (
      [
        'aws.msk.brokerId',
        'aws.kafka.BrokerID',
        'aws.msk.brokerId or aws.kafka.BrokerID',
        'aws.kafka.Topic',
        'aws.msk.topic',
        'aws.kafka.Topic OR aws.msk.topic',
      ].includes(keyName)
    ) {
      return getClusterFilterCondition(isNavigator, whereCond);
    }
    return whereCond;
  } else if (metricType === 'Broker') {
    if (
      [
        'aws.kafka.Topic',
        'aws.msk.topic',
        'aws.kafka.Topic OR aws.msk.topic',
        'aws.msk.clusterName or aws.kafka.ClusterName',
      ].includes(keyName)
    ) {
      return getClusterFilterCondition(isNavigator, whereCond);
    }
    return whereCond;
  }
  return whereCond;
};

export const KAFKA_PROVIDERS = [MSK_PROVIDER, CONFLUENT_CLOUD_PROVIDER];

export const MESSAGE_QUEUE_TYPES = ['Kafka'];

export const UPDATE_ITEMS_MAPPING: { [key: string]: string } = {
  Health: 'Health',
  CLUSTER_INCOMING_THROUGHPUT: 'Incoming Throughput',
  CLUSTER_OUTGOING_THROUGHPUT: 'Outgoing Throughput',
  hasError: 'hasError',
};

export const LOGO_MAPPING: { [key: string]: string } = {
  Kafka: 'provider-kafka',
  Rabbitmq: 'provider-rabbitmq',
};

export const CLUSTER_COLUMNS_MAPPING = (
  metricStream: boolean,
  provider: string,
) => {
  if (provider === MSK_PROVIDER) {
    return !metricStream
      ? 'provider.clusterName'
      : '`aws.kafka.ClusterName` OR `aws.msk.clusterName`';
  } else if (provider === CONFLUENT_CLOUD_PROVIDER) {
    return '`kafka.cluster_name` or `kafka.clusterName` or `confluent.clusterName`';
  }
  return '';
};
export const BASE_URL =
  window?.__nr?.services?.['public-chart-data-service'] || '';

export enum ChartData {
  Nrql = `/v2/nrql`,
  ApplicationBreakdown = `/v1/charts/application_breakdown`,
  BackgroundBreakdown = '/v1/charts/background_breakdown',
  NrqlV3 = '/v3/nrql',
}
export const ChartDataNrqlUrl = BASE_URL + ChartData.Nrql;

export const preDefinedFiltersForSummaryDropdown: Filter[] = [
  {
    id: 'filter-1',
    term: {
      label: 'Cluster status',
      value: 'status',
    },
    operator: {
      label: '=',
      multiple: false,
      value: '=',
    },
    value: {
      label: 'All',
      value: 'All',
    },
    writeable: true,
  },
];

export const ALL_FILTER_OBJ = { label: 'All', value: 'All' };

export const compareWithValuesForSummaryDropdown = [
  ALL_FILTER_OBJ,
  {
    label: 'Healthy',
    value: 'Healthy',
  },
  {
    label: 'Unhealthy',
    value: 'Unhealthy',
  },
];

export const SEARCH_FILTER_PLACEHOLDER = 'Search in name field';

export const ALL_CLUSTER_DOMAIN = `domain IN ('INFRA') AND type IN ('AWSMSKCLUSTER', 'CONFLUENTCLOUDCLUSTER')`;
export const ALL_TOPIC_DOMAIN = `domain IN ('INFRA') AND type IN ('AWSMSKTOPIC', 'CONFLUENTCLOUDKAFKATOPIC')`;

export const HOME_CLUSTER_FILTER_TEXT = 'Clusters';
export const HOME_TOPIC_FILTER_TEXT = 'Topics';

export const CLUSTER_FILTER_TEXT = 'Managed kafka clusters';
export const EQUAL_OPERATOR = '=';

export const SEARCH_2_OR_MORE_CHAR = 'Search with 2 or more characters';
export const ENTITLEMENTS_ERROR_TITLE =
  'Error fetching entitlements/feature flags';
export const ENTITLEMENTS_ERROR_DESCRIPTION =
  'An error occurred while fetching entitlements/feature flags. Please try again later.';

export const ACCOUNT_NOT_ENTITLED_TITLE =
  'Queues & Streams isn’t available in this account';
export const ACCOUNT_NOT_ENTITLED_DESCRIPTION =
  'This account does not have access to Queues & Streams. If you have multiple accounts, please try logging in with a different one. If the issue persists, contact your administrator for assistance.';
