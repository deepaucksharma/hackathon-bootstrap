import ALERT_SEVERITY from '@datanerd/fsi-high-density-view/dist/commonjs/common/shared/enums/ALERT_SEVERITY';
import { EntityGroup } from '@datanerd/fsi-high-density-view/dist/commonjs/common/shared/queries/EntitiesQuery';
import { Filter } from '@datanerd/shared-component-filter-bar/dist/common/types';

import {
  CONFLUENT_CLOUD_PROVIDER,
  DEFAULT_METRIC_VALUE,
  MSK_PROVIDER,
  MESSAGE_QUEUE_TYPE,
  CLUSTER_FILTER_TEXT,
  ALL_FILTER_OBJ,
  ALL_CLUSTER_DOMAIN,
  HOME_CLUSTER_FILTER_TEXT,
  ALL_TOPIC_DOMAIN,
  HOME_TOPIC_FILTER_TEXT,
} from '../config/constants';
import {
  EntityMetrics,
  MessageQueueMetaRowItem,
  Metric,
  TopicRowItem,
} from '../types/types';

import {
  messageRatehumanizeNumber,
  throughputHumanizeNumber,
} from './humanize';
import { clustersWithCursorQuery, topicsWithCursorQuery } from './query-utils';

export function prepareTopicsTableData(
  data: any,
  isRelationshipsPresent: boolean,
): {
  headers: string[];
  items: TopicRowItem[];
} {
  const headers: string[] = isRelationshipsPresent
    ? [
        'Topic Entity',
        '# of Producers & Consumers',
        'Incoming throughput',
        'Outgoing throughput',
        'Message rate',
      ]
    : [
        'Topic Entity',
        'Incoming throughput',
        'Outgoing throughput',
        'Message rate',
      ];

  return {
    headers,
    items: (data.results?.[0]?.events || []).slice(0, 20).map((event: any) => ({
      'Topic Entity': event['Name'] || event['name'] || event['Topic'],
      '# of Producers & Consumers': [],
      'Incoming throughput': throughputHumanizeNumber(
        event['bytesInPerSec'] || 0,
        true,
      ),
      'Outgoing throughput': throughputHumanizeNumber(
        event['bytesOutPerSec'] || 0,
        true,
      ),
      'Message rate': messageRatehumanizeNumber(event['messagesInPerSec'] || 0),
      'guid': event['guid'],
      'reporting': false,
      'alertSeverity': ALERT_SEVERITY.NOT_ALERTING,
      'permalink': '',
      'apmGuids': [],
    })),
  };
}

export function prepareTableData(data: any): {
  headers: string[];
  items: MessageQueueMetaRowItem[];
} {
  const headers: string[] = [
    'Name',
    'Clusters',
    'Health',
    'Incoming Throughput',
    'Outgoing Throughput',
    'Account Name',
    'Provider',
  ];

  const awsItems = data.actor.awsEntitySearch.results?.accounts?.map(
    (acc: any, index: number) => {
      return {
        'Name': [acc['name'], `${MESSAGE_QUEUE_TYPE} - ${MSK_PROVIDER}`],
        'Clusters':
          data.actor.awsEntitySearch.facetedCounts.counts[index].count,
        'Provider': MSK_PROVIDER,
        'Account Name': acc['name'],
        'Total/Unhealthy Clusters':
          data.actor.awsEntitySearch.facetedCounts.counts[index].count,
        'Health': [0, 0],
        'Incoming Throughput': 0,
        'Outgoing Throughput': 0,
        'Account Id': acc['id'],
        'Is Metric Stream': acc?.reportingEventTypes?.length === 0,
        'hasError': false,
      };
    },
  );

  const confluentCloudItems =
    data.actor.confluentCloudEntitySearch.results?.accounts?.map(
      (acc: any, index: number) => {
        return {
          'Name': [
            acc['name'],
            `${MESSAGE_QUEUE_TYPE} - ${CONFLUENT_CLOUD_PROVIDER}`,
          ],
          'Clusters':
            data.actor.confluentCloudEntitySearch.facetedCounts.counts[index]
              .count,
          'Provider': CONFLUENT_CLOUD_PROVIDER,
          'Account Name': acc['name'],
          'Total/Unhealthy Clusters':
            data.actor.confluentCloudEntitySearch.facetedCounts.counts[index]
              .count,
          'Health': [0, 0],
          'Incoming Throughput': 0,
          'Outgoing Throughput': 0,
          'Account Id': acc['id'],
          'Is Metric Stream': false,
          'hasError': false,
        };
      },
    );

  const combinedItems = [...awsItems, ...confluentCloudItems];
  combinedItems.sort((a, b) => a['Account Id'] - b['Account Id']);
  return { headers, items: combinedItems };
}

export const ALERT_SEVERITY_ORDER: { [key: string]: number } = {
  CRITICAL: 0,
  WARNING: 1,
  NOT_ALERTING: 2,
  NOT_CONFIGURED: 3,
};

export const isUnhealthyEntity = (
  m: Metric,
  provider: string,
  show: string,
): boolean => {
  if (provider === CONFLUENT_CLOUD_PROVIDER)
    return (
      (m.name === 'Hot partition Ingress' && m.value === 1) ||
      (m.name === 'Hot partition Egress' && m.value === 1) ||
      (m.name === 'Cluster load percent' && (m.value === 0 || m.value > 70))
    );

  if (show === 'topic') {
    return (
      (m.name === 'Bytes In' && m.value === 0) ||
      (m.name === 'Bytes Out' && m.value === 0)
    );
  }

  return (
    (m.name === 'Active Controllers' && m.value !== 1) ||
    (m.name === 'Offline Partitions' && m.value > 0) ||
    (m.name === 'Under Min ISR Partitions' && m.value > 0) ||
    (m.name === 'Under Replicated Partitions' && m.value > 0)
  );
};

export const getEntityHealth = (
  EntityMetrics: EntityMetrics,
  provider: string,
  show: string,
): ALERT_SEVERITY => {
  if (provider === CONFLUENT_CLOUD_PROVIDER && show === 'cluster') {
    const isNotConfigured = EntityMetrics.metrics.some(
      (m: Metric) =>
        m.name === 'Cluster load percent' && m.value === DEFAULT_METRIC_VALUE,
    );
    if (isNotConfigured) return ALERT_SEVERITY.NOT_CONFIGURED;
  }

  if (show === 'topic') {
    const hasBytesInZero = EntityMetrics.metrics.some(
      (m: Metric) =>
        (m.name === 'Bytes In' && m.value === 0) || m.value === undefined,
    );
    const hasBytesOutZero = EntityMetrics.metrics.some(
      (m: Metric) =>
        (m.name === 'Bytes Out' && m.value === 0) || m.value === undefined,
    );

    if (hasBytesInZero && hasBytesOutZero) {
      return ALERT_SEVERITY.WARNING;
    }
    return ALERT_SEVERITY.NOT_ALERTING;
  }

  const isUnhealthy = EntityMetrics.metrics.some((m: Metric) =>
    isUnhealthyEntity(m, provider, show),
  );

  return isUnhealthy ? ALERT_SEVERITY.WARNING : ALERT_SEVERITY.NOT_ALERTING;
};

export const prepareEntityGroups = (
  EntityMetrics: EntityMetrics[],
  provider: string,
  show: string,
  groupByFilters?: string,
): EntityGroup[] => {
  if (groupByFilters) {
    if (EntityMetrics.length === 1 && !Array.isArray(EntityMetrics[0][show])) {
      const showValue = EntityMetrics[0][show];
      const match =
        (showValue as string).match(/\(([^)]+)\)/) ||
        (showValue as string).split(':');

      if (match && match[1]) {
        EntityMetrics = [
          {
            [show]: [showValue, match[1]],
            metrics: EntityMetrics[0].metrics,
          } as any,
        ];
      }
    }

    const uniqueGroups = Array.from(
      new Set(
        EntityMetrics.map((c) => (c[show].slice(1) as Metric[]).join(' | ')),
      ),
    );

    const result = uniqueGroups.map((item) => {
      const obj = EntityMetrics.filter(
        (topic) => (topic[show].slice(1) as Metric[]).join(' | ') === item,
      )
        .map((topic) => ({
          [show]: topic[show][0],
          metrics:
            show === 'broker'
              ? [...topic.metrics, { name: 'display', value: topic[show][0] }]
              : topic.metrics,
          type: getEntityHealth(topic, provider, show),
          count: 1,
        }))
        .sort((a, b) => {
          const order =
            ALERT_SEVERITY_ORDER[a.type] - ALERT_SEVERITY_ORDER[b.type];
          return order === 0
            ? ((b[show] as string) || '').localeCompare(
                (a[show] as string) || '',
              )
            : order;
        });

      return {
        id: item,
        name: item,
        counts: obj,
        count: obj.length,
      };
    });

    return result;
  }

  const groupedEntities = EntityMetrics.map((c) => ({
    [show]: c[show],
    type: getEntityHealth(c, provider, show),
    metrics: c.metrics,
    count: 1,
  }));

  const counts = groupedEntities.sort((k1, k2) => {
    const order = ALERT_SEVERITY_ORDER[k1.type] - ALERT_SEVERITY_ORDER[k2.type];
    return order === 0
      ? ((k1[show] as string) || '').localeCompare((k2[show] as string) || '')
      : order;
  });

  return [
    {
      id: 'nrOthersGroupId',
      name: 'nrOthersGroupId',
      counts,
      count: EntityMetrics.length,
    },
  ];
};

export const deletedAccountClusterMessages = [
  'Your Infrastructure query has been transformed into a query that is compatible with the new Metric format.',
  'Your Metric query has been transformed into a query that is compatible with the previous Infrastructure metric format.',
];

export const accountDeletedUIMessage =
  "This account's data was Unlinked from New Relic and can take up to 24 hours to be removed from this page";

export const getCustomTooltipMetricValueText = (
  itemName: string,
  itemValue: number | string,
): string | number => {
  if (itemName === 'Cluster load percent' && typeof itemValue === 'number') {
    return itemValue === DEFAULT_METRIC_VALUE
      ? 'No value'
      : `${itemValue.toFixed(2)}%`;
  }

  if (
    itemName === 'Hot partition Ingress' ||
    itemName === 'Hot partition Egress'
  ) {
    return itemValue == null ? 'No issues' : itemValue;
  }

  if (itemName === 'Bytes In' || itemName === 'Bytes Out') {
    return itemValue == null
      ? 'No value'
      : throughputHumanizeNumber(parseInt(itemValue.toString(), 10), true);
  }

  return itemValue == null ? 'No value' : itemValue;
};

export const homeFilterLabels = ['Message Queue Type', 'Provider', 'Account'];

export const getPredefinedFilters = (): Filter[] => {
  return [
    {
      id: homeFilterLabels[0],
      term: {
        label: homeFilterLabels[0],
        value: homeFilterLabels[0],
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: [ALL_FILTER_OBJ],
      writeable: true,
    },
    {
      id: homeFilterLabels[1],
      term: {
        label: homeFilterLabels[1],
        value: homeFilterLabels[1],
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: [ALL_FILTER_OBJ],
      writeable: true,
    },
    {
      id: homeFilterLabels[2],
      term: {
        label: homeFilterLabels[2],
        value: homeFilterLabels[2],
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: [ALL_FILTER_OBJ],
      writeable: true,
    },
  ];
};

export const getPredefinedFiltersForSummary = (
  accountName: string,
  provider: string,
  isMetricStream: boolean,
  extraCluster: string,
  extraTopic: string,
  extraBrokerId: string,
): Filter[] => {
  const filterLabels = ['Account', 'Provider', CLUSTER_FILTER_TEXT, 'Topics'];
  if (provider === MSK_PROVIDER) filterLabels.splice(3, 0, 'Broker Ids');

  const Clusters = [];
  const Brokers = [];
  const Topics = [];

  if (extraCluster) {
    Clusters.push({ label: extraCluster, value: extraCluster });
  } else {
    Clusters.unshift(ALL_FILTER_OBJ);
  }
  if (extraBrokerId) {
    Brokers.push({ label: extraBrokerId, value: extraBrokerId });
  } else {
    Brokers.unshift(ALL_FILTER_OBJ);
  }
  if (extraTopic) {
    Topics.push({ label: extraTopic, value: extraTopic });
  } else {
    Topics.unshift(ALL_FILTER_OBJ);
  }

  const filterData: Filter[] = [
    {
      id: filterLabels[0],
      term: {
        label: filterLabels[0],
        value: filterLabels[0],
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: [{ label: accountName, value: accountName }],
      writeable: false,
    },
    {
      id: filterLabels[1],
      term: {
        label: filterLabels[1],
        value: filterLabels[1],
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: [{ label: provider, value: provider }],
      writeable: false,
    },
    {
      id: filterLabels[2],
      term: {
        label: filterLabels[2],
        value:
          provider === MSK_PROVIDER
            ? !isMetricStream
              ? 'provider.clusterName'
              : 'aws.kafka.ClusterName or aws.msk.clusterName'
            : 'kafka.cluster_name or kafka.clusterName or confluent.clusterName',
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: Clusters,
      writeable: true,
    },
  ];

  if (provider === MSK_PROVIDER) {
    filterData.push({
      id: filterLabels[3],
      term: {
        label: filterLabels[3],
        value: !isMetricStream
          ? 'provider.brokerId'
          : 'aws.msk.brokerId or aws.kafka.BrokerID',
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: Brokers,
      writeable: true,
    });
    filterData.push({
      id: filterLabels[4],
      term: {
        label: filterLabels[4],
        value: !isMetricStream
          ? 'provider.topic'
          : 'aws.kafka.Topic OR aws.msk.topic',
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: Topics,
      writeable: true,
    });
  } else if (provider === CONFLUENT_CLOUD_PROVIDER) {
    filterData.push({
      id: filterLabels[3],
      term: {
        label: filterLabels[3],
        value: 'topic or confluent.kafka.server.metric.topic',
      },
      operator: { label: '=', multiple: true, value: '=' },
      value: Topics,
      writeable: true,
    });
  }

  return filterData;
};

/**
 * This method will take array of objects or JSON object which is in nerdlet state or predefined filters.
 * It converts that json object into array of strings which can be used in NRQL where clause.
 *
 * @param filterSet
 * @returns
 */
export const getSummaryFilterWhereClause = (filterSet: Filter[]): string[] => {
  const whereClause: string[] = [];

  if (filterSet.length > 0) {
    const filterIds = filterSet
      .map((f: any) => {
        return f.term.value;
      })
      .filter((_: any, index: number) => index > 1);
    const valuesArray: any[][] = filterSet
      .map((f: any) => {
        if (Array.isArray(f.value)) {
          return f.value.map((v: any) => v.value);
        } else {
          return [f.value.value];
        }
      })
      .filter((_: any, index: number) => index > 1);

    for (let i = 0; i < filterIds.length; i++) {
      if (!valuesArray[i].includes('All')) {
        whereClause.push(
          `(${filterIds[i]}) IN ('${valuesArray[i].join("','")}')`,
        );
      }
    }
  }
  return whereClause;
};
export const getCustomTooltipMetricValueClass = (
  itemName: string,
  itemValue: number,
  metricHealthPredicateMap: { [key: string]: (value: number) => boolean },
): string => {
  if (
    (itemName === 'Hot partition Ingress' ||
      itemName === 'Hot partition Egress') &&
    itemValue == null
  ) {
    return 'Success';
  }
  if (itemValue === DEFAULT_METRIC_VALUE || itemValue == null) {
    return 'Neutral';
  }

  return metricHealthPredicateMap[itemName] &&
    metricHealthPredicateMap[itemName](itemValue)
    ? 'Critical'
    : 'Success';
};

export const filterOperatorhelper = (
  filterTerm: string,
  operator: string,
  filterItemValue: string,
  values: string | any[],
) => {
  const stringifiedFilterItemValue = Array.isArray(filterItemValue)
    ? filterTerm === 'Name'
      ? filterItemValue?.[1]?.split(' - ')?.[0]
      : filterItemValue?.[1]
    : filterItemValue.toString();
  if (
    filterTerm === 'Account Name' &&
    Array.isArray(values) &&
    !values.includes('All')
  ) {
    values = values
      .map((v: any) => v.split(' - '))
      .map((v: any) => v.slice(0, v.length - 1).join(' - '));
  }

  switch (operator) {
    case '=':
      return values.includes('All')
        ? true
        : values.includes(stringifiedFilterItemValue);
    case '!=':
      return values.includes('All')
        ? false
        : !values.includes(stringifiedFilterItemValue);
    case 'LIKE':
      return stringifiedFilterItemValue.includes(values);
    case 'NOT LIKE':
      return !stringifiedFilterItemValue.includes(values);
    default:
      return false;
  }
};

export const getClusterFilterSet = (
  clusters: string,
  provider: string,
  isMetricStream: boolean,
) => {
  if (!clusters) return [];
  return provider === MSK_PROVIDER
    ? !isMetricStream
      ? [`\`provider.clusterName\` IN (${clusters})`]
      : [
          `(\`aws.kafka.ClusterName\` or \`aws.msk.clusterName\`) IN (${clusters})`,
        ]
    : [
        `(\`kafka.cluster_name\` or \`kafka.clusterName\` or \`confluent.clusterName\`) IN (${clusters})`,
      ];
};

const extractAccountIds = (
  filterIndex: number,
  sourceItems: any[],
  onFilterBarChange: (
    filter: Filter[],
    searchString: string,
    customSortedItems: any[],
  ) => MessageQueueMetaRowItem[],
  filter: Filter[],
  searchString: string,
) =>
  onFilterBarChange(
    filter?.[filterIndex] ? [filter?.[filterIndex]] : [],
    searchString,
    sourceItems,
  ).map((item: any) => item['Account Id']);

const intersectAccountIds = (ids1: any[], ids2: any[]) =>
  ids1.filter((id) => ids2.includes(id));

export const getFilterAccountIds = (
  onFilterBarChange: (
    filter: Filter[],
    searchString: string,
    customSortedItems: any[],
  ) => MessageQueueMetaRowItem[],
  filter: Filter[],
  searchString: string,
  items: any[],
  initialItems: any[],
) => {
  const accountIdsByFilterIndex = [0, 1, 2].map((filterIndex) =>
    extractAccountIds(
      filterIndex,
      items,
      onFilterBarChange,
      filter,
      searchString,
    ),
  );

  const [queueTypeAccountIds, providerAccountIds, accountNameAccountIds] =
    accountIdsByFilterIndex;

  const allAccountIds = items.map((item: any) => item['Account Id']);

  const filteredQueueTypeAccountIds = intersectAccountIds(
    intersectAccountIds(allAccountIds, providerAccountIds),
    accountNameAccountIds,
  );

  const filteredProviderAccountIds = intersectAccountIds(
    intersectAccountIds(allAccountIds, queueTypeAccountIds),
    accountNameAccountIds,
  );

  const filteredAccountNameAccountIds = intersectAccountIds(
    intersectAccountIds(allAccountIds, queueTypeAccountIds),
    providerAccountIds,
  );

  const initialAccountIds = initialItems.map((item: any) => item['Account Id']);
  const initialAccountIdsByFilterIndex = [0, 1, 2].map((filterIndex) =>
    extractAccountIds(
      filterIndex,
      initialItems,
      onFilterBarChange,
      filter,
      searchString,
    ),
  );

  const [
    queueTypeInitialAccountIds,
    providerInitialAccountIds,
    accountInitialAccountIds,
  ] = initialAccountIdsByFilterIndex;

  const finalAccountIds = intersectAccountIds(
    intersectAccountIds(initialAccountIds, queueTypeInitialAccountIds),
    intersectAccountIds(providerInitialAccountIds, accountInitialAccountIds),
  );

  return {
    queueTypeAccountIds: filteredQueueTypeAccountIds,
    providerAccountIds: filteredProviderAccountIds,
    accountNameAccountIds: filteredAccountNameAccountIds,
    finalAccountIds,
  };
};

export const validateForm = (
  term: { label: string; value: string } | null,
  selectedValues: any[],
  setTermError: any,
  setValueError: any,
) => {
  const hasValue = selectedValues.length;
  const isThereError = !term || !hasValue;

  if (!term) {
    setTermError('This field is required');
  }

  if (!hasValue) {
    setValueError('This field is required');
  }

  return !isThereError;
};

export const topicFilterCond = (filterClusters: string) => {
  if (!filterClusters) return '';
  return `AND (tags.aws.clusterName IN (${filterClusters}) OR tags.aws.kafka.ClusterName IN (${filterClusters}) OR tags.confluent.clusterName IN (${filterClusters}))`;
};

export const getHomeEditFilters = (
  clusterFilter: string,
  topicFilter: string,
  counts: { [key: string]: any },
  accountIds: string,
  filterClusterData: { [key: string]: any },
) => {
  const filters = [
    {
      value: clusterFilter,
      totalCount: counts.totalClusters,
      variableName: 'clusterQuery',
      variableDomain: ALL_CLUSTER_DOMAIN,
      query: clustersWithCursorQuery,
      entitySearchType: 'clusterEntitySearch',
      component:
        'Message - Queues - Clusters - Search - NerdGraph - Query - Home',
      componentId: 'message-queues-clusters-search-nerdgraph-query-home',
      filterId: HOME_CLUSTER_FILTER_TEXT,
      preSelectedValues: clusterFilter,
      accountIds: accountIds,
      filterClusters: `${filterClusterData.topicClusters ? `AND name IN (${filterClusterData.topicClusters})` : ''}`,
    },
    {
      value: topicFilter,
      totalCount: counts.totalTopics,
      variableName: 'topicQuery',
      variableDomain: ALL_TOPIC_DOMAIN,
      query: topicsWithCursorQuery,
      entitySearchType: 'topicEntitySearch',
      component:
        'Message - Queues - Topics - Search - NerdGraph - Query - Home',
      componentId: 'message-queues-topics-search-nerdgraph-query-home',
      filterId: HOME_TOPIC_FILTER_TEXT,
      preSelectedValues: topicFilter,
      accountIds: accountIds,
      filterClusters: topicFilterCond(filterClusterData.clusterFilterClusters),
    },
  ];
  return filters;
};
