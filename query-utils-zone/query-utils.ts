/* eslint @typescript-eslint/no-unused-vars: 0 */

import NRQLModel from '@datanerd/nrql-model';
import { ngql } from 'nr1';

import {
  MSK_PROVIDER_POLLING,
  CONFLUENT_CLOUD_PROVIDER,
  confluentCloudTopicWhereCond,
  DEFAULT_METRIC_VALUE,
  getAwsStreamWhere,
  getConditionMapping,
  keyMapping,
  LIMIT_20,
  MAX_LIMIT,
  METRIC_IDS,
  MSK_PROVIDER,
  PROVIDERS_ID_MAP,
  METRIC_TAG_ATTRIBUTES,
} from '../config/constants';
import { QueryModel, QueryOptions, StaticInfo } from '../types/types';

export const AWS_CLUSTER_QUERY_FILTER =
  "domain IN ('INFRA') AND type='AWSMSKCLUSTER'";

export const AWS_TOPIC_QUERY_FILTER =
  "domain IN ('INFRA') AND type='AWSMSKTOPIC'";

export const AWS_BROKER_QUERY_FILTER =
  "domain IN ('INFRA') AND type='AWSMSKBROKER'";
export const CONFLUENT_CLOUD_QUERY_FILTER_CLUSTER =
  "domain IN ('INFRA') AND type='CONFLUENTCLOUDCLUSTER'";

export const CONFLUENT_CLOUD_QUERY_FILTER_TOPIC =
  "domain IN ('INFRA') AND type='CONFLUENTCLOUDKAFKATOPIC'";

export const AWS_CLUSTER_QUERY_FILTER_FUNC = (searchName: string) => {
  return `${AWS_CLUSTER_QUERY_FILTER} ${searchName ? `AND name IN (${searchName})` : ''}`;
};

export const COUNT_TOPIC_QUERY_FILTER = `domain IN ('INFRA') AND type IN ('AWSMSKTOPIC', 'CONFLUENTCLOUDKAFKATOPIC')`;

export const CONFLUENT_CLOUD_QUERY_FILTER_CLUSTER_FUNC = (
  searchName: string,
) => {
  return `${CONFLUENT_CLOUD_QUERY_FILTER_CLUSTER} ${searchName ? `AND name IN (${searchName})` : ''}`;
};

export const CONFLUENT_CLOUD_QUERY_FILTER_TOPIC_FUNC = (searchName: string) => {
  return `${CONFLUENT_CLOUD_QUERY_FILTER_TOPIC} AND name IN (${searchName})`;
};

export const AWS_TOPIC_QUERY_FILTER_FUNC = (searchName: string) => {
  return `${AWS_TOPIC_QUERY_FILTER} AND type='AWSMSKTOPIC' AND name IN (${searchName})`;
};

export const ALL_KAFKA_TABLE_QUERY = ngql`query ALL_KAFKA_TABLE_QUERY($awsQuery: String!, $confluentCloudQuery: String!, $facet: EntitySearchCountsFacet!,$orderBy: EntitySearchOrderBy!) {
  actor {
    awsEntitySearch: entitySearch(query: $awsQuery) {
      count
      facetedCounts(facets: {facetCriterion: {facet: $facet}, orderBy: $orderBy}) {
        counts {
          count
          facet
        }
      }
      results {
        accounts {
          id
          name
          reportingEventTypes(filter: "AwsMskBrokerSample")
        }
      }
    }
    confluentCloudEntitySearch: entitySearch(query: $confluentCloudQuery) {
      count
      facetedCounts(facets: {facetCriterion: {facet: $facet}, orderBy: $orderBy}) {
        counts {
          count
          facet
        }
      }
      results {
        accounts {
          id
          name
        }
      }
    }
  }
}`;

export const GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY = ngql`query GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY($awsTopicQuery: String!, $confluentTopicQuery: String!) {
  actor {
    awsTopicEntitySearch: entitySearch(query: $awsTopicQuery) {
      __typename
      polling: groupedResults(by: {tag: "aws.clusterName"}) {
        group
      }
      metrics: groupedResults(by: {tag: "aws.kafka.ClusterName"}) {
        group
      }
    }
    confluentTopicEntitySearch: entitySearch(query: $confluentTopicQuery) {
      __typename
      groupedResults(by: {tag: "confluent.clusterName"}) {
        group
      }
    }
  }
}`;

export const GET_RELATED_APM_ENTITIES_FOR_TOPIC = ngql`query GetRelatedAPMEntitiesForTopic($entityGuids: [EntityGuid!]) {
  actor {
    entities(guids: $entityGuids) {
      alertSeverity
      permalink
      guid
      name
      reporting
      consumsedBy: relatedEntities(
        filter: {direction: BOTH, relationshipTypes: {include: CONSUMES}, entityDomainTypes: {include: {domain: "APM", type: "APPLICATION"}}}
      ) {
        count
        results {
          source {
            guid
          }
        }
      }
      producedBy: relatedEntities(
        filter: {direction: BOTH, relationshipTypes: {include: PRODUCES}, entityDomainTypes: {include: {domain: "APM", type: "APPLICATION"}}}
      ) {
        count
        results {
          source {
            guid
          }
        }
      }
    }
    __typename
  }
}`;

export const getTopicsTableQuery: any = (
  queryKey: string,
  orderBy: string,
  where: any[],
  attributeSortMapping: { [key: string]: string },
) => {
  const queries: { [key: string]: any } = {
    aws_polling: {
      select: [
        `guid`,
        `Name`,
        `Topic`,
        `bytesInPerSec`,
        `bytesOutPerSec`,
        `messagesInPerSec`,
      ],
      from: {
        select: [
          "average(provider.bytesInPerSec.Average) or 0 AS 'bytesInPerSec'",
          "average(provider.bytesOutPerSec.Average) or 0 AS 'bytesOutPerSec'",
          "average(provider.messagesInPerSec.Average) or 0 AS 'messagesInPerSec'",
        ],
        from: 'AwsMskTopicSample',
        facet: [
          "entityGuid as 'guid'",
          "entityName as 'Name'",
          "`provider.topic` AS 'Topic'",
        ],
        orderBy: `average(${attributeSortMapping[orderBy]} or 0)`,
        limit: MAX_LIMIT,
      },
      where: ['(`provider.topic` IS NOT NULL)', ...where],
      orderBy: `${orderBy} DESC`,
      limit: LIMIT_20,
      isNested: true,
    },
    aws_metric_streams: {
      select: [
        `guid`,
        `Name`,
        `Topic`,
        `bytesInPerSec`,
        `bytesOutPerSec`,
        `messagesInPerSec`,
      ],
      from: {
        select: [
          "average(aws.kafka.BytesInPerSec.byTopic) or 0 AS 'bytesInPerSec'",
          "average(aws.kafka.BytesOutPerSec.byTopic) or 0 AS 'bytesOutPerSec'",
          "average(aws.kafka.MessagesInPerSec.byTopic) or 0 AS 'messagesInPerSec'",
        ],
        from: 'Metric',
        facet: [
          "entity.guid as 'guid'",
          "entity.name OR entityName as 'Name'",
          "`aws.kafka.Topic` OR `aws.msk.topic` AS 'Topic'",
        ],
        orderBy: `average(${attributeSortMapping[orderBy]} or 0)`,
        limit: MAX_LIMIT,
        metricType: 'Topic',
      },
      where: [
        "metricName like '%aws.kafka%' AND ((`aws.kafka.Topic` OR `aws.msk.topic`) IS NOT NULL)",
        ...where,
      ],
      orderBy: `${orderBy} DESC`,
      limit: LIMIT_20,
      isNested: true,
    },
    confluent_cloud_polling: {
      select: [
        `guid`,
        `name`,
        `Topic`,
        `bytesInPerSec`,
        `bytesOutPerSec`,
        `messagesInPerSec`,
      ],
      from: {
        select: [
          "average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) or 0 AS 'bytesInPerSec'",
          "average(confluent_kafka_server_sent_bytes or confluent.kafka.server.sent_bytes) or 0 AS 'bytesOutPerSec'",
          "average(confluent_kafka_server_received_records or confluent.kafka.server.received_records) or 0 AS 'messagesInPerSec'",
        ],
        from: 'Metric',
        facet: [
          `entity.guid as 'guid'`,
          `entity.name OR entityName as 'name'`,
          "`topic` OR `confluent.kafka.server.metric.topic` AS 'Topic'",
        ],
        orderBy: `average(${attributeSortMapping[orderBy]} or 0)`,
        limit: MAX_LIMIT,
        metricType: 'Topic',
      },
      where: [
        "metricName like '%confluent%' AND ((`topic` OR `confluent.kafka.server.metric.topic`) IS NOT NULL)",
        ...where,
      ],
      orderBy: `${orderBy} DESC`,
      limit: LIMIT_20,
      isNested: true,
    },
  };
  return queries[queryKey];
};

export const DIM_QUERIES: QueryOptions = {
  CLUSTER_INCOMING_THROUGHPUT: {
    select: `sum(bytesInPerSec)`,
    from: {
      select: `average(provider.bytesInPerSec.Average) as 'bytesInPerSec'`,
      from: 'AwsMskBrokerSample',
      facet: ['provider.clusterName as cluster', 'provider.brokerId'],
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  CLUSTER_OUTGOING_THROUGHPUT: {
    select: `sum(bytesOutPerSec)`,
    from: {
      select: `average(provider.bytesOutPerSec.Average) as 'bytesOutPerSec'`,
      from: 'AwsMskBrokerSample',
      facet: ['provider.clusterName as cluster', 'provider.brokerId'],
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  CLUSTER_HEALTH_QUERY: {
    select:
      "latest(`provider.activeControllerCount.Sum`) AS 'Active Controllers', latest(`provider.offlinePartitionsCount.Sum`) AS 'Offline Partitions'",
    from: 'AwsMskClusterSample',
    facet: 'provider.clusterName as cluster',
    limit: MAX_LIMIT,
  },
  CLUSTER_HEALTH_QUERY_BY_BROKER: {
    select:
      "filter(datapointCount(),WHERE `Under Min ISR Partitions` > 0) as 'Under Min ISR Partitions',filter(datapointCount(),WHERE `Under Replicated Partitions` > 0) as 'Under Replicated Partitions'",
    from: {
      select:
        "latest(`provider.underReplicatedPartitions.Sum`) AS 'Under Replicated Partitions',latest(`provider.underMinIsrPartitionCount.Sum`) AS 'Under Min ISR Partitions'",
      from: 'AwsMskBrokerSample',
      facet: ["provider.clusterName as 'cluster'", 'provider.brokerId'],
      limit: MAX_LIMIT,
    },
    facet: "'cluster'",
    limit: MAX_LIMIT,
    isNested: true,
  },
  TOPIC_HEALTH_QUERY: {
    select:
      "latest(`provider.bytesInPerSec.Sum`) OR 0 AS 'Bytes In', latest(`provider.bytesOutPerSec.Sum`) AS 'Bytes Out'",
    from: 'AwsMskTopicSample',
    facet: ["`displayName` AS 'topic'"],
    limit: MAX_LIMIT,
  },
  TOPIC_GROUPBY_CLUSTER: {
    select:
      "latest(`provider.bytesInPerSec.Sum`) OR 0 AS 'Bytes In', latest(`provider.bytesOutPerSec.Sum`) AS 'Bytes Out'",
    from: 'AwsMskTopicSample',
    facet: [
      "`displayName` AS 'topic'",
      "`provider.clusterName` as 'clusterName'",
    ],
    limit: MAX_LIMIT,
  },
  TOPIC_GROUPBY_BROKER: {
    select:
      "latest(`provider.bytesInPerSec.Sum`) OR 0 AS 'Bytes In', latest(`provider.bytesOutPerSec.Sum`) AS 'Bytes Out'",
    from: 'AwsMskTopicSample',
    facet: [
      "`displayName` AS 'topic'",
      '`provider.clusterName`',
      '`provider.brokerId`',
    ],
    limit: MAX_LIMIT,
  },

  BROKER_HEALTH_QUERY: {
    select:
      "latest(`provider.underMinIsrPartitionCount.Sum`) AS 'Under Min ISR Partitions', latest(`provider.underReplicatedPartitions.Sum`) AS 'Under Replicated Partitions'",
    from: 'AwsMskBrokerSample',
    facet: "`displayName` AS 'broker'",
    limit: MAX_LIMIT,
  },

  BROKER_GROUPBY_CLUSTER: {
    select:
      "latest(`provider.underMinIsrPartitionCount.Sum`) AS 'Under Min ISR Partitions', latest(`provider.underReplicatedPartitions.Sum`) AS 'Under Replicated Partitions'",
    from: 'AwsMskBrokerSample',
    facet: ["`displayName` AS 'broker'", '`provider.clusterName`'],
    limit: MAX_LIMIT,
  },
};

export const MTS_QUERIES: QueryOptions = {
  CLUSTER_INCOMING_THROUGHPUT: {
    select: `sum(BytesInPerSec)`,
    from: {
      select: `filter(average(aws.kafka.BytesInPerSec.byBroker),where metricName='aws.kafka.BytesInPerSec.byBroker') as 'BytesInPerSec'`,
      from: 'Metric',
      facet: [
        "aws.kafka.ClusterName OR aws.msk.clusterName as 'cluster'",
        'aws.kafka.BrokerID OR aws.msk.brokerId',
      ],
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  CLUSTER_OUTGOING_THROUGHPUT: {
    select: `sum(BytesOutPerSec)`,
    from: {
      select: `filter(average(aws.kafka.BytesOutPerSec.byBroker),where metricName='aws.kafka.BytesOutPerSec.byBroker') as 'BytesOutPerSec'`,
      from: 'Metric',
      facet: [
        "aws.kafka.ClusterName OR aws.msk.clusterName as 'cluster'",
        'aws.kafka.BrokerID OR aws.msk.brokerId',
      ],
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  CLUSTER_HEALTH_QUERY: {
    select: `latest(\`Active Controllers\`) as 'Active Controllers',latest(\`Offline Partitions\`) as 'Offline Partitions'`,
    from: {
      select: `filter(sum(aws.kafka.ActiveControllerCount)/datapointCount(),where metricName='aws.kafka.ActiveControllerCount') as 'Active Controllers',filter(sum(aws.kafka.OfflinePartitionsCount),where metricName='aws.kafka.OfflinePartitionsCount') as 'Offline Partitions'`,
      from: 'Metric',
      facet: ["aws.kafka.ClusterName OR aws.msk.clusterName AS 'cluster'"],
      limit: MAX_LIMIT,
      metricType: 'Cluster',
    },
    facet: 'cluster',
    limit: MAX_LIMIT,
    isNested: true,
    metricType: 'Cluster',
  },
  CLUSTER_HEALTH_QUERY_BY_BROKER: {
    select: `filter(datapointCount(),WHERE \`Under Min ISR Partitions\` > 0) as 'Under Min ISR Partitions',filter(datapointCount(),WHERE \`Under Replicated Partitions\` > 0) as 'Under Replicated Partitions'`,
    from: {
      select: `latest(timestamp),filter(sum(\`aws.kafka.underReplicatedPartitions\`),where metricName LIKE 'aws.kafka.underReplicatedPartitions') as 'underReplicatedPartitions',filter(sum(\`aws.kafka.underMinIsrPartitionCount\`),where metricName LIKE 'aws.kafka.underMinIsrPartitionCount') as 'underMinIsrPartitionCount'`,
      from: 'Metric',
      facet: ["aws.kafka.ClusterName OR aws.msk.clusterName AS 'cluster'"],
      limit: MAX_LIMIT,
      metricType: 'Cluster',
    },
    facet: 'cluster',
    limit: MAX_LIMIT,
    isNested: true,
    metricType: 'Cluster',
  },
  TOPIC_HEALTH_QUERY: {
    select: `latest(\`Bytes In\`) as 'Bytes In', latest(\`Bytes Out\`) as 'Bytes Out'`,
    from: {
      select: `filter(uniqueCount(\`displayName\` OR \`entity.name\`), where metricName like 'aws.kafka%byTopic'), filter(sum(\`aws.kafka.BytesInPerSec.byTopic\`)/datapointCount(), where metricName='aws.kafka.BytesInPerSec.byTopic') as 'Bytes In', filter(sum(\`aws.kafka.BytesOutPerSec.byTopic\`)/datapointCount(), where metricName='aws.kafka.BytesOutPerSec.byTopic') as 'Bytes Out'`,
      from: 'Metric',
      where: ["metricName like 'aws.kafka%byTopic'"],
      facet: ["`displayName` OR `entity.name` as 'topic'"],
      limit: MAX_LIMIT,
    },
    facet: 'topic',
    limit: MAX_LIMIT,
    isNested: true,
  },
  TOPIC_GROUPBY_CLUSTER: {
    select: `latest(\`Bytes In\`) as 'Bytes In', latest(\`Bytes Out\`) as 'Bytes Out'`,
    from: {
      select: `filter(uniqueCount(\`displayName\` OR \`entity.name\`), where metricName like 'aws.kafka%byTopic'), filter(sum(aws.kafka.BytesInPerSec.byTopic)/datapointCount(), where metricName='aws.kafka.BytesInPerSec.byTopic') as 'Bytes In', filter(sum(aws.kafka.BytesOutPerSec.byTopic)/datapointCount(), where metricName='aws.kafka.BytesOutPerSec.byTopic') as 'Bytes Out'`,
      from: 'Metric',
      where: ["metricName like 'aws.kafka%byTopic'"],
      facet: [
        "`displayName` OR `entity.name` as 'topic'",
        "`aws.msk.clusterName` OR `aws.kafka.ClusterName` as 'clusterName'",
      ],
      limit: MAX_LIMIT,
      metricType: 'Topic',
    },
    facet: ["`topic` as 'topic'", "`clusterName` as 'clusterName'"],
    limit: MAX_LIMIT,
    isNested: true,
    metricType: 'Topic',
  },
  TOPIC_GROUPBY_BROKER: {
    select:
      "latest(`Bytes In`) as 'Bytes In2', latest(`Bytes Out`) as 'Bytes Out6'",
    from: {
      select: `filter(uniqueCount(\`displayName\` OR \`entity.name\`), where metricName like 'aws.kafka%byTopic'), filter(sum(aws.kafka.BytesInPerSec.byTopic)/datapointCount(),where metricName='aws.kafka.BytesInPerSec.byTopic') as 'Bytes In', filter(sum(aws.kafka.BytesOutPerSec.byTopic)/datapointCount(), where metricName='aws.kafka.BytesOutPerSec.byTopic') as 'Bytes Out'`,
      from: 'Metric',
      facet: [
        "displayName as 'topic'",
        "concat('cluster: ', `aws.kafka.ClusterName`, ' | broker: ', `aws.kafka.BrokerID`) as 'brokerGroup'",
      ],
      limit: MAX_LIMIT,
      metricType: 'Topic',
    },
    facet: ['`topic`', '`brokerGroup`'],
    limit: MAX_LIMIT,
    metricType: 'Topic',
  },
  BROKER_HEALTH_QUERY: {
    select: `latest(\`Under Min ISR Partitions\`) as 'Under Min ISR Partitions', latest(\`Under Replicated Partitions\`) as 'Under Replicated Partitions'`,
    from: {
      select: `filter(sum(\`aws.kafka.UnderMinIsrPartitionCount\`)/datapointCount(), where metricName='aws.kafka.UnderMinIsrPartitionCount.byBroker') as 'Under Min ISR Partitions', filter(sum(\`aws.kafka.UnderReplicatedPartitions\`)/datapointCount(), where metricName='aws.kafka.UnderReplicatedPartitions') as 'Under Replicated Partitions'`,
      from: 'Metric',
      facet: ["`displayName` OR `entity.name` as 'broker'"],
      limit: MAX_LIMIT,
      metricType: 'Broker',
    },
    facet: '`broker`',
    limit: MAX_LIMIT,
    isNested: true,
    metricType: 'Broker',
  },

  BROKER_GROUPBY_CLUSTER: {
    select: `latest(\`Under Min ISR Partitions\`) as 'Under Min ISR Partitions', latest(\`Under Replicated Partitions\`) as 'Under Replicated Partitions'`,
    from: {
      select: `filter(sum(\`aws.kafka.UnderMinIsrPartitionCount\`)/datapointCount() , where metricName='aws.kafka.UnderMinIsrPartitionCount.byBroker') as 'Under Min ISR Partitions', filter(sum(\`aws.kafka.UnderReplicatedPartitions\`)/datapointCount(), where metricName='aws.kafka.UnderReplicatedPartitions') as 'Under Replicated Partitions'`,
      from: 'Metric',
      facet: [
        "`displayName` OR `entity.name` as 'broker'",
        "`aws.msk.clusterName` OR `aws.kafka.ClusterName` as 'cluster'",
      ],
      limit: MAX_LIMIT,
      metricType: 'Broker',
    },
    facet: ['`broker`', '`cluster`'],
    limit: MAX_LIMIT,
    isNested: true,
    metricType: 'Broker',
  },
};

export const CONFLUENT_CLOUD_DIM_QUERIES: QueryOptions = {
  CLUSTER_INCOMING_THROUGHPUT: {
    select: `sum(bytesInPerSec)`,
    from: {
      select: `average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) as 'bytesInPerSec'`,
      from: 'Metric',
      where: ["metricName like '%confluent%'"],
      facet:
        'kafka.cluster_name or kafka.clusterName or confluent.clusterName as cluster',
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  CLUSTER_OUTGOING_THROUGHPUT: {
    select: `sum(bytesOutPerSec)`,
    from: {
      select: `average(confluent_kafka_server_sent_bytes or confluent.kafka.server.sent_bytes) as 'bytesOutPerSec'`,
      from: 'Metric',
      where: ["metricName like '%confluent%'"],
      facet:
        'kafka.cluster_name or kafka.clusterName or confluent.clusterName as cluster',
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  CLUSTER_HEALTH_QUERY: {
    select: `(average(confluent_kafka_server_cluster_load_percent or confluent.kafka.server.cluster_load_percent)*100 or ${DEFAULT_METRIC_VALUE}) as 'Cluster load percent', filter(average(confluent_kafka_server_hot_partition_ingress or confluent.kafka.server.hot_partition_ingress), WHERE (confluent_kafka_server_hot_partition_ingress or confluent.kafka.server.hot_partition_ingress)=1 AND metricName=('confluent_kafka_server_hot_partition_ingress' or 'confluent.kafka.server.hot_partition_ingress'))  as 'Hot partition Ingress', filter(average(confluent_kafka_server_hot_partition_egress or confluent.kafka.server.hot_partition_egress), WHERE (confluent_kafka_server_hot_partition_egress or confluent.kafka.server.hot_partition_egress)=1 AND metricName=('confluent_kafka_server_hot_partition_egress' or 'confluent.kafka.server.hot_partition_egress'))  as 'Hot partition Egress'`,
    from: 'Metric',
    where: ["metricName like '%confluent%'"],
    facet: 'kafka.cluster_name or kafka.clusterName or confluent.clusterName',
    limit: MAX_LIMIT,
    metricType: 'Cluster',
  },
  TOPIC_HEALTH_QUERY: {
    select: `latest(\`Bytes In\`) as 'Bytes In', latest(\`Bytes Out\`) as 'Bytes Out'`,
    from: {
      select: `filter(uniqueCount(topic OR confluent.kafka.server.metric.topic), where metricName like '%confluent%'), filter(sum(\`confluent.kafka.server.received_bytes\`)/datapointCount(), where metricName='confluent.kafka.server.received_bytes') as 'Bytes In', filter(sum(\`aws.kafka.confluent.kafka.server.sent_bytes\`)/datapointCount(), where metricName='confluent.kafka.server.sent_bytes') as 'Bytes Out'`,
      from: 'Metric',
      where: ["metricName like '%confluent%'"],
      facet: ["`displayName` OR `entity.name` as 'topic'"],
      limit: MAX_LIMIT,
    },
    facet: 'topic',
    limit: MAX_LIMIT,
    isNested: true,
  },
  TOPIC_GROUPBY_CLUSTER: {
    select: `latest(\`Bytes In\`) as 'Bytes In', latest(\`Bytes Out\`) as 'Bytes Out'`,
    from: {
      select: `filter(uniqueCount(topic or confluent.kafka.server.metric.topic), where metricName like '%confluent%'), filter(sum(\`confluent.kafka.server.received_bytes\`)/datapointCount(), where metricName='confluent.kafka.server.received_bytes') as 'Bytes In', filter(sum(\`aws.kafka.confluent.kafka.server.sent_bytes\`)/datapointCount(), where metricName='confluent.kafka.server.sent_bytes') as 'Bytes Out'`,
      from: 'Metric',
      where: ["metricName like '%confluent%'"],
      facet: [
        "`displayName` OR `entity.name` as 'topic'",
        "kafka.cluster_name or kafka.clusterName or confluent.clusterName as 'clusterName'",
      ],
      limit: MAX_LIMIT,
      metricType: 'Topic',
    },
    facet: ["`topic` as 'topic'", "`clusterName` as 'clusterName'"],
    limit: MAX_LIMIT,
    isNested: true,
    metricType: 'Topic',
  },
};

export const TOTAL_CLUSTERS_QUERY = (
  provider: string,
  isMetricStream: boolean,
) => {
  if (provider === MSK_PROVIDER) {
    if (!isMetricStream) {
      return {
        select: `uniqueCount(provider.clusterName) as 'Total clusters'`,
        from: 'AwsMskClusterSample',
      };
    }
    return {
      select: `uniqueCount(aws.kafka.ClusterName OR aws.msk.clusterName) as 'Total clusters'`,
      from: 'Metric',
      where: ["(metricName like 'aws.kafka%byTopic')"],
    };
  } else if (provider === CONFLUENT_CLOUD_PROVIDER) {
    return {
      select: `uniqueCount(kafka.cluster_name or kafka.clusterName or confluent.clusterName) as 'Total clusters'`,
      from: 'Metric',
      where: ["metricName like '%confluent%'"],
      metricType: 'Cluster',
    };
  }
  return {};
};

const SUMMARY_QUERIES: any = (staticInfo: StaticInfo) => {
  return {
    aws_polling: {
      [METRIC_IDS.TOTAL_CLUSTERS]: {
        select: `uniqueCount(provider.clusterName) as  'Total clusters'`,
        from: 'AwsMskClusterSample',
      },
      [METRIC_IDS.UNHEALTHY_CLUSTERS]: {
        from: 'AwsMskTopicSample',
        select: `${staticInfo.unhealthyClusters} as 'Unhealthy clusters'`,
      },
      [METRIC_IDS.BROKERS]: {
        select: [
          "uniqueCount(tuple(provider.clusterName,provider.brokerId)) as 'Brokers'",
        ],
        from: 'AwsMskBrokerSample',
        alias: 'Brokers',
        limit: MAX_LIMIT,
      },
      [METRIC_IDS.PARTITIONS_COUNT]: {
        select: `sum(\`partitions\`)`,
        from: {
          select: `round(average(provider.globalPartitionCount.Average)) as 'partitions'`,
          from: 'AwsMskClusterSample',
          facet: 'provider.clusterName',
          limit: MAX_LIMIT,
        },
        alias: 'Partitions',
        isNested: true,
      },
      [METRIC_IDS.TOPICS]: {
        from: 'AwsMskTopicSample',
        select: `uniqueCount(displayName) as 'Topics'`,
      },
      [METRIC_IDS.BROKER_COUNT_BY_CLUSTER]: {
        from: 'AwsMskBrokerSample',
        select: ["uniqueCount(provider.brokerId) as 'Broker Count'"],
        facet: ["provider.clusterName AS 'Cluster'"],
        limit: MAX_LIMIT,
      },
      [METRIC_IDS.TOPIC_COUNT_BY_CLUSTER]: {
        from: 'AwsMskTopicSample',
        select: ["uniqueCount(displayName) as 'Topic Count'"],
        facet: ["provider.clusterName as 'cluster'"],
        limit: MAX_LIMIT,
      },
      [METRIC_IDS.INCOMING_THROUGHPUT_BY_TOPIC]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.bytesInPerSec.Average) AS 'Topic Througput'",
          ],
          facet: [
            "provider.topic AS 'Topic'",
            "provider.brokerId AS 'Broker'",
            "provider.clusterName AS 'Cluster'",
          ],
          limit: MAX_LIMIT,
        },
        select: ['sum(`Topic Througput`)'],
        facet: ['Topic'],
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.PARTITIONS_COUNT_BY_CLUSTER]: {
        from: 'AwsMskClusterSample',
        select: [
          "round(average(provider.globalPartitionCount.Average)) as 'partitions'",
        ],
        facet: ["provider.clusterName as 'cluster'"],
        limit: MAX_LIMIT,
      },
      [METRIC_IDS.TOTAL_PRODUCED_THROUGHPUT]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.bytesInPerSec.Average) as 'bytesInPerSec'",
          ],
          facet: [
            'provider.clusterName',
            'provider.brokerId',
            'provider.topic',
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
        },
        select: ['sum(`bytesInPerSec`)'],
        isTimeseries: true,
        isNested: true,
      },
      [METRIC_IDS.MESSAGES_PRODUCED_RATE]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.messagesInPerSec.Average) as 'messagesInPerSec'",
          ],
          facet: [
            'provider.clusterName',
            'provider.brokerId',
            'provider.topic',
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
        },
        select: ['sum(`messagesInPerSec`)'],
        isTimeseries: true,
        isNested: true,
      },
      [METRIC_IDS.THROUGHPUT_BY_CLUSTER]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.bytesInPerSec.Average) as 'bytesInPerSec'",
          ],
          facet: [
            "provider.clusterName as 'cluster'",
            "provider.brokerId as 'broker'",
            'provider.topic',
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
        },
        select: ['sum(`bytesInPerSec`)'],
        facet: [`cluster`],
        isTimeseries: true,
        limit: MAX_LIMIT,
        isNested: true,
      },
      [METRIC_IDS.INCOMING_THROUGHPUT_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.bytesInPerSec.Average) as 'bytesInPerSec'",
          ],
          facet: [
            'provider.clusterName',
            "provider.brokerId as 'broker'",
            "provider.topic as 'topic'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
        },
        select: ['sum(`bytesInPerSec`)'],
        facet: [`topic`],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.OUTGOING_THROUGHPUT_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.bytesOutPerSec.Average) as 'bytesOutPerSec'",
          ],
          facet: [
            'provider.clusterName',
            "provider.brokerId as 'broker'",
            "provider.topic as 'topic'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
        },
        select: ['sum(`bytesOutPerSec`)'],
        facet: [`topic`],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.THROUGHPUT_DEVIATION_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.bytesInPerSec.Average) as 'bytesInPerSec'",
            "average(provider.bytesOutPerSec.Average) as 'bytesOutPerSec'",
          ],
          facet: [
            'provider.clusterName',
            'provider.brokerId',
            "provider.topic as 'topic'",
          ],
          where: ["provider.topic != '__consumer_offsets'"],
          isTimeseries: true,
          limit: MAX_LIMIT,
        },
        select: ['sum(`bytesOutPerSec`)-sum(`bytesInPerSec`)'],
        facet: [`topic`],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.INCOMING_MESSAGE_RATE_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.messagesInPerSec.Average) as 'messagesInPerSec'",
          ],
          facet: [
            'provider.clusterName',
            "provider.brokerId as 'broker'",
            "provider.topic as 'topic'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
        },
        select: ['sum(`messagesInPerSec`)'],
        facet: [`topic`],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.OUTGOING_MESSAGE_RATE_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'AwsMskTopicSample',
          select: [
            "average(provider.messagesOutPerSec.Average) as 'messagesOutPerSec'",
          ],
          facet: [
            'provider.clusterName',
            "provider.brokerId as 'broker'",
            "provider.topic as 'topic'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
        },
        select: ['sum(`messagesOutPerSec`)'],
        facet: [`topic`],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
    },
    aws_metric_streams: {
      [METRIC_IDS.TOTAL_CLUSTERS]: {
        from: 'Metric',
        select: [
          {
            select: `filter(uniqueCount(\`aws.kafka.ClusterName\` OR \`aws.msk.clusterName\`), where entity.type like '%CLUSTER%' ${staticInfo.filterClusterMetric ? `AND ${staticInfo.filterClusterMetric}` : ''}) as 'Total clusters'`,
          },
        ],
        isSelectNested: true,
      },
      [METRIC_IDS.UNHEALTHY_CLUSTERS]: {
        from: 'Metric',
        select: `${staticInfo.unhealthyClusters} as 'Unhealthy clusters'`,
      },
      [METRIC_IDS.BROKERS]: {
        from: 'Metric',
        select: `filter(uniqueCount(tuple((\`aws.kafka.ClusterName\` OR \`aws.msk.clusterName\`), (\`aws.kafka.BrokerID\` OR \`aws.msk.brokerId\`))) , WHERE metricName like 'aws.kafka%byBroker') as 'Brokers'`,
        metricType: 'Broker',
      },
      [METRIC_IDS.PARTITIONS_COUNT]: {
        select: `sum(\`partitions\`) as 'Partitions'`,
        from: {
          select: `round(average(aws.kafka.GlobalPartitionCount)) as 'partitions'`,
          from: 'Metric',
          facet: 'aws.kafka.ClusterName OR aws.msk.clusterName',
          where: ["metricName like '%aws.kafka%'"],
          metricType: 'Cluster',
          limit: MAX_LIMIT,
        },
        isNested: true,
      },
      [METRIC_IDS.TOPICS]: {
        from: 'Metric',
        select: `filter(uniqueCount(\`displayName\` OR \`entity.name\`), where metricName like 'aws.kafka%byTopic') as 'Topics'`,
      },
      [METRIC_IDS.BROKER_COUNT_BY_CLUSTER]: {
        from: 'Metric',
        select: 'uniqueCount(`aws.kafka.BrokerID` OR `aws.msk.brokerId`)',
        facet: ['aws.kafka.ClusterName OR aws.msk.clusterName'],
        limit: MAX_LIMIT,
        metricType: 'Broker',
      },
      [METRIC_IDS.TOPIC_COUNT_BY_CLUSTER]: {
        from: 'Metric',
        select: [
          `filter(uniqueCount(\`displayName\` OR \`entity.name\`), where metricName like 'aws.kafka%byTopic') as 'Topic Count'`,
        ],
        facet: ["aws.kafka.ClusterName OR aws.msk.clusterName as 'cluster'"],
        where: ["metricName like 'aws.kafka%byTopic'"],
        limit: MAX_LIMIT,
      },
      [METRIC_IDS.INCOMING_THROUGHPUT_BY_TOPIC]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.BytesInPerSec.byTopic) AS 'bytesInPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesInPerSec`)'],
        facet: ['Topic'],
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.PARTITIONS_COUNT_BY_CLUSTER]: {
        from: 'Metric',
        select: [
          "round(average(aws.kafka.GlobalPartitionCount)) as 'partitions'",
        ],
        facet: ["aws.kafka.ClusterName OR aws.msk.clusterName as 'cluster'"],
        where: ["entity.type like '%CLUSTER%'"],
        limit: MAX_LIMIT,
        metricType: 'Cluster',
      },
      [METRIC_IDS.TOTAL_PRODUCED_THROUGHPUT]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.BytesInPerSec.byTopic) AS 'bytesInPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesInPerSec`)'],
        isTimeseries: true,
        isNested: true,
      },
      [METRIC_IDS.MESSAGES_PRODUCED_RATE]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.MessagesInPerSec.byTopic) AS 'messagesInPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`messagesInPerSec`)'],
        isTimeseries: true,
        isNested: true,
      },
      [METRIC_IDS.THROUGHPUT_BY_CLUSTER]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.BytesInPerSec.byTopic) AS 'bytesInPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesInPerSec`)'],
        isTimeseries: true,
        facet: [`Cluster`],
        limit: MAX_LIMIT,
        isNested: true,
      },
      [METRIC_IDS.INCOMING_THROUGHPUT_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.BytesInPerSec.byTopic) AS 'bytesInPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesInPerSec`)'],
        isTimeseries: true,
        facet: [`Topic`],
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.OUTGOING_THROUGHPUT_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.BytesOutPerSec.byTopic) AS 'bytesOutPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesOutPerSec`)'],
        isTimeseries: true,
        facet: [`Topic`],
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.THROUGHPUT_DEVIATION_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.BytesOutPerSec.byTopic) AS 'bytesOutPerSec'",
            "average(aws.kafka.BytesInPerSec.byTopic) AS 'bytesInPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          where: ["(aws.kafka.Topic OR aws.msk.topic) != '__consumer_offsets'"],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesOutPerSec`)-sum(`bytesInPerSec`)'],
        isTimeseries: true,
        facet: [`Topic`],
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.INCOMING_MESSAGE_RATE_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.MessagesInPerSec.byTopic) AS 'messagesInPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`messagesInPerSec`)'],
        isTimeseries: true,
        facet: ['Topic'],
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.OUTGOING_MESSAGE_RATE_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(aws.kafka.MessagesOutPerSec.byTopic) AS 'messagesOutPerSec'",
          ],
          facet: [
            "aws.kafka.Topic OR aws.msk.topic AS 'Topic'",
            "aws.kafka.BrokerID OR aws.msk.brokerId AS 'Broker'",
            "aws.kafka.ClusterName OR aws.msk.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`messagesOutPerSec`)'],
        isTimeseries: true,
        facet: ['Topic'],
        limit: LIMIT_20,
        isNested: true,
      },
    },
    confluent_cloud_polling: {
      [METRIC_IDS.TOTAL_CLUSTERS]: {
        select: `uniqueCount(kafka.cluster_name or kafka.clusterName or confluent.clusterName) as 'Total clusters'`,
        from: 'Metric',
        metricType: 'Cluster',
        where: ["metricName like '%confluent%'"],
      },
      [METRIC_IDS.UNHEALTHY_CLUSTERS]: {
        from: 'Metric',
        select: `${staticInfo.unhealthyClusters} as 'Unhealthy clusters'`,
        metricType: 'Cluster',
        where: ["metricName like '%confluent%'"],
      },
      [METRIC_IDS.TOPICS]: {
        from: 'Metric',
        select: `uniqueCount(displayName) as 'Topics'`,
        metricType: 'Topic',
        where: [
          "metricName like '%confluent%' and entity.type like '%CONFLUENTCLOUDKAFKATOPIC%'",
        ],
      },
      [METRIC_IDS.PARTITIONS_COUNT]: {
        select: `sum(\`partitions\`)`,
        from: {
          select: `round(average(confluent_kafka_server_partition_count or confluent.kafka.server.partition_count)) as 'partitions'`,
          from: 'Metric',
          facet:
            'kafka.cluster_name OR kafka.clusterName or confluent.clusterName',
          metricType: 'Cluster',
          limit: MAX_LIMIT,
        },
        alias: 'Partitions',
        isNested: true,
        metricType: 'Cluster',
      },
      [METRIC_IDS.TOPIC_COUNT_BY_CLUSTER]: {
        from: 'Metric',
        select: [
          "uniqueCount(topic or confluent.kafka.server.metric.topic) as 'Topic Count'",
        ],
        where: ["metricName like '%confluent%'"],
        facet: [
          "`kafka.cluster_name` or `kafka.clusterName or confluent.clusterName` as 'cluster'",
        ],
        limit: MAX_LIMIT,
        metricType: 'Topic',
      },
      [METRIC_IDS.INCOMING_THROUGHPUT_BY_TOPIC]: {
        from: {
          from: 'Metric',
          select:
            "average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) AS 'Topic Throughput'",
          facet: [
            "topic or confluent.kafka.server.metric.topic AS 'Topic'",
            "kafka.cluster_name or kafka.clusterName or confluent.clusterName AS 'Cluster'",
          ],
          limit: MAX_LIMIT,
          isTimeseries: true,
          metricType: 'Topic',
        },
        select: ['sum(`Topic Throughput`)'],
        where: ["metricName like '%confluent%'"],
        facet: ['Topic'],
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.PARTITIONS_COUNT_BY_CLUSTER]: {
        from: 'Metric',
        select: [
          "average(confluent_kafka_server_partition_count or confluent.kafka.server.partition_count) as 'partitions'",
        ],
        where: ["metricName like '%confluent%'"],
        facet: [
          "FACET `kafka.cluster_name` or `kafka.clusterName or confluent.clusterName` as 'cluster'",
        ],
        limit: MAX_LIMIT,
        metricType: 'Cluster',
      },
      [METRIC_IDS.TOTAL_PRODUCED_THROUGHPUT]: {
        from: {
          from: 'Metric',
          select: [
            "average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) AS 'bytesInPerSec'",
          ],
          where: ["metricName like '%confluent%'"],
          facet: [
            'topic or confluent.kafka.server.metric.topic',
            'kafka.cluster_name or kafka.clusterName or confluent.clusterName',
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesInPerSec`)/60'],
        isTimeseries: true,
        isNested: true,
      },
      [METRIC_IDS.MESSAGES_PRODUCED_RATE]: {
        from: {
          from: 'Metric',
          select: [
            "average(confluent_kafka_server_received_records or confluent.kafka.server.received_records) AS 'messagesInPerSec'",
          ],
          where: ["metricName like '%confluent%'"],
          facet: [
            'topic or confluent.kafka.server.metric.topic',
            'kafka.cluster_name or kafka.clusterName or confluent.clusterName',
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`messagesInPerSec`)/60'],
        isTimeseries: true,
        isNested: true,
      },
      [METRIC_IDS.THROUGHPUT_BY_CLUSTER]: {
        from: {
          from: 'Metric',
          select: [
            "average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) AS 'bytesInPerSec'",
          ],
          where: ["metricName like '%confluent%'"],
          facet: [
            "topic or confluent.kafka.server.metric.topic AS 'Topic'",
            "kafka.cluster_name or kafka.clusterName or confluent.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesInPerSec`)/60'],
        facet: ['Cluster'],
        isTimeseries: true,
        limit: MAX_LIMIT,
        isNested: true,
      },
      [METRIC_IDS.INCOMING_THROUGHPUT_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) AS 'bytesInPerSec'",
          ],
          where: ["metricName like '%confluent%'"],
          facet: [
            "topic or confluent.kafka.server.metric.topic AS 'Topic'",
            "kafka.cluster_name or kafka.clusterName or confluent.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesInPerSec`)/60'],
        facet: ['Topic'],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.OUTGOING_THROUGHPUT_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(confluent_kafka_server_sent_bytes or confluent.kafka.server.sent_bytes) AS 'bytesOutPerSec'",
          ],
          where: ["metricName like '%confluent%'"],
          facet: [
            "topic or confluent.kafka.server.metric.topic AS 'Topic'",
            "kafka.cluster_name or kafka.clusterName or confluent.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesOutPerSec`)/60'],
        facet: ['Topic'],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.THROUGHPUT_DEVIATION_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) as 'bytesInPerSec'",
            "average(confluent_kafka_server_sent_bytes or confluent.kafka.server.sent_bytes) as 'bytesOutPerSec'",
          ],
          facet: [
            'kafka.cluster_name or kafka.clusterName or confluent.clusterName',
            'kafka_id or kafka.id or confluentClusterId',
            "topic or confluent.kafka.server.metric.topic as 'topic'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`bytesOutPerSec`)-sum(`bytesInPerSec`)'],
        facet: [`topic`],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.INCOMING_MESSAGE_RATE_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(confluent_kafka_server_received_records or confluent.kafka.server.received_records) AS 'messagesInPerSec'",
          ],
          where: ["metricName like '%confluent%'"],
          facet: [
            "topic or confluent.kafka.server.metric.topic AS 'Topic'",
            "kafka.cluster_name or kafka.clusterName or confluent.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`messagesInPerSec`)/60'],
        facet: ['Topic'],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
      [METRIC_IDS.OUTGOING_MESSAGE_RATE_BY_TOPIC_TIMESERIES]: {
        from: {
          from: 'Metric',
          select: [
            "average(confluent_kafka_server_sent_records or confluent.kafka.server.sent_records) AS 'messagesOutPerSec'",
          ],
          where: ["metricName like '%confluent%'"],
          facet: [
            "topic or confluent.kafka.server.metric.topic AS 'Topic'",
            "kafka.cluster_name or kafka.clusterName or confluent.clusterName AS 'Cluster'",
          ],
          isTimeseries: true,
          limit: MAX_LIMIT,
          metricType: 'Topic',
        },
        select: ['sum(`messagesOutPerSec`)'],
        facet: ['Topic'],
        isTimeseries: true,
        limit: LIMIT_20,
        isNested: true,
      },
    },
  };
};

export const getConditionFilters: any = (filtersApplied: any, key: string) => {
  return filtersApplied[key] ? `(${filtersApplied[key]})` : '';
};

export const getClusterGroupWhereCond = (filterSet: any) => {
  const filtersApplied: any = {
    broker: '',
    cluster: '',
    topic: '',
  };

  (filterSet || []).forEach((filter: string) => {
    if (filter.includes('aws.msk.brokerId or aws.kafka.BrokerID')) {
      filtersApplied.broker = filtersApplied.broker.length
        ? filtersApplied.broker + ' AND ' + filter
        : filter;
    } else if (filter.includes('aws.kafka.Topic OR aws.msk.topic')) {
      filtersApplied.topic = filtersApplied.topic.length
        ? filtersApplied.topic + ' AND ' + filter
        : filter;
    } else {
      filtersApplied.cluster = filtersApplied.cluster.length
        ? filtersApplied.cluster + ' AND ' + filter
        : filter;
    }
  });

  const clusterGroupApplied =
    (filtersApplied.broker || filtersApplied.topic) && filtersApplied.cluster;

  return filterSet.length
    ? `WHERE ${
        filtersApplied.broker || filtersApplied.topic
          ? `((\`aws.kafka.ClusterName\` OR \`aws.msk.clusterName\`) in (SELECT (\`aws.kafka.ClusterName\` OR \`aws.msk.clusterName\`) from Metric where 
    ${getConditionFilters(filtersApplied, 'broker')} 
    ${filtersApplied.topic && filtersApplied.broker ? ' AND ' : ''} 
    ${getConditionFilters(filtersApplied, 'topic')}`
          : ''
      } 
    ${filtersApplied.cluster ? '' : 'LIMIT MAX))'}
    ${clusterGroupApplied ? ' AND ' : ''}
    ${getConditionFilters(filtersApplied, 'cluster')}
    ${clusterGroupApplied ? 'LIMIT MAX))' : ''}`
    : '';
};

export const getQueryString: any = (
  queryDefinition: any,
  provider: string,
  isNavigator?: boolean,
  filterSet?: any[],
) => {
  const from: string = queryDefinition?.isNested
    ? `(${getQueryString({ ...queryDefinition.from, where: queryDefinition.where }, provider, isNavigator, filterSet)})`
    : queryDefinition?.from;

  const select: string = queryDefinition?.isSelectNested
    ? queryDefinition.select
        .map((val: any) =>
          val.from
            ? `(${getQueryString({ ...val, where: queryDefinition.where }, provider, isNavigator, filterSet)}) ${val.alias ? `AS '${val.alias}'` : ''}`
            : val.select,
        )
        .join(', ')
    : queryDefinition?.select;

  let nrql: any = new NRQLModel(from)
    .select(select)
    .since(queryDefinition?.timeRange);

  const gropuCond: any = {
    AwsMskClusterSample: '',
    AwsMskBrokerSample: '',
    AwsMskTopicSample: '',
    AwsMskBrokerMetric: '',
  };

  if (
    queryDefinition?.where &&
    !queryDefinition?.isNested &&
    (!queryDefinition.isSelectNested ||
      queryDefinition.includeSelectNestedWhere)
  ) {
    let mappedWhere = '';

    if (
      queryDefinition?.metricType === 'Cluster' &&
      provider === MSK_PROVIDER
    ) {
      mappedWhere = getClusterGroupWhereCond(filterSet);
    } else {
      queryDefinition.where.forEach((whereVal: string) => {
        const parts = whereVal.split(' IN ');
        const firstPart = parts?.[0];

        const keyName = firstPart.substring(1, firstPart.length - 1);
        const conditionMapping = getConditionMapping(keyName);
        let whereCond;
        if (queryDefinition.metricType) {
          if (
            provider === CONFLUENT_CLOUD_PROVIDER &&
            queryDefinition.metricType === 'Cluster'
          ) {
            whereCond = confluentCloudTopicWhereCond(
              whereVal,
              isNavigator,
              queryDefinition,
            );
          } else if (provider === MSK_PROVIDER) {
            if (queryDefinition.metricType === 'Broker') {
              if (whereVal.includes('aws.msk.brokerId or aws.kafka.BrokerID')) {
                gropuCond.AwsMskBrokerMetric = `${whereVal} AND `;
              } else {
                whereVal = `${gropuCond.AwsMskBrokerMetric} ${whereVal}`;
              }
            }
            whereCond = getAwsStreamWhere(
              queryDefinition.metricType,
              keyName,
              whereVal,
              isNavigator,
            );
          } else {
            whereCond = whereVal;
          }
        } else {
          if (provider === MSK_PROVIDER_POLLING) {
            const sampleType = Object.keys(conditionMapping)[0];
            gropuCond[sampleType] = gropuCond[sampleType]
              ? [gropuCond[sampleType], whereVal].join(' AND ')
              : whereVal;

            if (whereVal.includes('provider.brokerId')) {
              gropuCond.AwsMskBrokerSample = whereVal;
            }

            const keyMap = queryDefinition.isNested
              ? queryDefinition.from.from
              : queryDefinition.from;

            whereCond =
              queryDefinition.from != 'AwsMskTopicSample'
                ? `${keyMapping[keyMap]} IN (SELECT uniques(${keyMapping[keyMap]}) from AwsMskTopicSample where ${gropuCond.AwsMskClusterSample})`
                : `${gropuCond.AwsMskClusterSample}`;

            if (
              queryDefinition.from === 'AwsMskBrokerSample' &&
              whereCond.includes('provider.brokerId')
            ) {
              whereCond = `${gropuCond.AwsMskBrokerSample} AND ${whereCond}`;
            }
          } else {
            whereCond = whereVal;
          }
        }
        mappedWhere =
          mappedWhere === '' || provider === MSK_PROVIDER_POLLING
            ? whereCond
            : `${mappedWhere} AND ${whereCond}`;
      });
    }
    nrql = nrql.where(mappedWhere);
  }

  if (queryDefinition.facet) {
    nrql = nrql.facet(queryDefinition.facet);
  }
  if (queryDefinition.orderBy) {
    nrql = nrql.orderBy(queryDefinition.orderBy);
  }
  if (queryDefinition.limit) {
    nrql = nrql.limit(queryDefinition.limit);
  }
  if (queryDefinition.isTimeseries) {
    nrql = nrql.timeseries();
  }

  return nrql.toString();
};

export const getModifiedFilterSetForTags = (filterSet: any[]) => {
  return (filterSet || []).map((whereVal: string) => {
    const parts = whereVal.split(' IN ');
    const firstPart = parts?.[0];
    const keyName = firstPart.substring(1, firstPart.length - 1);
    if (METRIC_TAG_ATTRIBUTES.includes(keyName)) {
      const whereCond = getAwsStreamWhere('Topic', keyName, whereVal);
      return whereCond;
    }
    return whereVal;
  });
};

export const getQueryByProviderAndPreference = (
  isPreferMetrics: boolean,
  provider: string,
  metricId: string,
  filterSet: any[],
  facet: string[],
  timeRange: TimeRanges,
  staticInfo: StaticInfo,
): string => {
  const prodiverInfo: { key: string; value: string } =
    PROVIDERS_ID_MAP[provider];

  const clusterOtherFilter: string[] = [];
  const custerFilterCond: string[] = [];

  (filterSet || []).forEach((whereVal: string) => {
    const parts = whereVal.split(' IN ');
    const firstPart = parts?.[0];

    const keyName = firstPart.substring(1, firstPart.length - 1);

    if (
      [
        'aws.msk.brokerId or aws.kafka.BrokerID',
        'aws.kafka.Topic OR aws.msk.topic',
        'provider.brokerId',
        'provider.topic',
      ].includes(keyName)
    ) {
      clusterOtherFilter.push(whereVal);
    } else {
      custerFilterCond.push(whereVal);
    }
  });

  const clustersCond: string[] = [...clusterOtherFilter, ...custerFilterCond];

  let clusterFilterWhere = '';

  if (clustersCond.length > 0) {
    const parts = clustersCond[0]?.split(' IN ');
    const firstPart = parts?.[0];

    const keyName = firstPart.substring(1, firstPart.length - 1);

    clusterFilterWhere = getAwsStreamWhere(
      'Cluster',
      keyName,
      clustersCond.join(' AND '),
    );
  }

  const brokerFilterWhere = (filterSet || [])
    .map((whereVal: string) => {
      const parts = whereVal.split(' IN ');
      const firstPart = parts?.[0];

      const keyName = firstPart.substring(1, firstPart.length - 1);

      const whereCond = getAwsStreamWhere('Broker', keyName, whereVal);
      return whereCond;
    })
    .join(' AND');
  const topicFilterWhere = (filterSet || [])
    .map((whereVal: string) => {
      const parts = whereVal.split(' IN ');
      const firstPart = parts?.[0];

      const keyName = firstPart.substring(1, firstPart.length - 1);

      const whereCond = getAwsStreamWhere('Topic', keyName, whereVal);
      return whereCond;
    })
    .join(' AND');

  const queryDefinition: QueryModel = SUMMARY_QUERIES({
    ...staticInfo,
    filterClusterMetric: clusterFilterWhere,
    filterBrokerMetric: brokerFilterWhere,
    filterTopicMetric: topicFilterWhere,
  })[
    isPreferMetrics
      ? [prodiverInfo, 'metric_streams'].join('_')
      : [prodiverInfo, 'polling'].join('_')
  ][metricId];

  const modifiedFilterSet = getModifiedFilterSetForTags(filterSet);

  if (filterSet && filterSet.length > 0) {
    queryDefinition.where = [
      ...modifiedFilterSet,
      ...(queryDefinition?.where || []),
    ];
  }

  if (facet.length > 0) {
    queryDefinition.facet?.push(...facet);
  }

  const providerType = isPreferMetrics
    ? MSK_PROVIDER
    : provider === CONFLUENT_CLOUD_PROVIDER
      ? CONFLUENT_CLOUD_PROVIDER
      : MSK_PROVIDER_POLLING;

  return getQueryString(queryDefinition, providerType, false, filterSet);
};

export const getIntegrationType = (item: any) => {
  const isMetricStream = item['Is Metric Stream'];
  return isMetricStream
    ? MSK_PROVIDER
    : item.Provider === CONFLUENT_CLOUD_PROVIDER
      ? CONFLUENT_CLOUD_PROVIDER
      : MSK_PROVIDER_POLLING;
};

export const clustersWithCursorQuery = (cursor: string | null) => {
  return `query ALL_CLUSTERS_QUERY($clusterQuery: String!) {
  actor {
      clusterEntitySearch: entitySearch(query: $clusterQuery) {
        results(cursor: ${cursor ? `"${cursor}"` : null}) {
          __typename
          entities {
            name
          }
          nextCursor
      }
      __typename
    }
}
}`;
};

export const topicsWithCursorQuery = (cursor: string | null) => {
  return `query ALL_TOPICS_QUERY($topicQuery: String!) {
  actor {
      topicEntitySearch: entitySearch(query: $topicQuery) {
        results(cursor: ${cursor ? `"${cursor}"` : null}) {
          __typename
          entities {
            name
          }
          nextCursor
      }
      __typename
    }
}
}`;
};
