import {
  instrumentation,
  NrqlQuery,
  useNrqlQueries,
  usePlatformState,
} from 'nr1';
import ALERT_SEVERITY from '@datanerd/fsi-high-density-view/dist/commonjs/common/shared/enums/ALERT_SEVERITY';

import { getQueryByProviderAndPreference } from '../../utils/query-utils';
import { MessageQueueMetaRowItem } from '../../types/types';
import { METRIC_IDS, MSK_PROVIDER } from '../../config/constants';
import { prepareEntityGroups } from '../../utils/data-utils';
import { useFetchEntityMetrics } from '../use-fetch-entity-metrics';

const POLL_INTERVAL = 1 * 60 * 1000;
export function useSummaryChartData({
  item,
  filterSet,
  unhealthyClusters,
}: {
  item: MessageQueueMetaRowItem;
  filterSet: any[];
  unhealthyClusters: number;
}) {
  const [{ timeRange }] = usePlatformState();
  const accountId = item['Account Id'];

  let queries: any[] = [];

  const totalClusterQuery = getQueryByProviderAndPreference(
    item['Is Metric Stream'],
    item['Provider'],
    METRIC_IDS?.TOTAL_CLUSTERS || '',
    filterSet,
    [],
    timeRange as any,
    { unhealthyClusters },
  );
  const unhealthyClustersQuery = getQueryByProviderAndPreference(
    item['Is Metric Stream'],
    item['Provider'],
    METRIC_IDS?.UNHEALTHY_CLUSTERS || '',
    filterSet,
    [],
    timeRange as any,
    { unhealthyClusters },
  );

  const topicsQuery = getQueryByProviderAndPreference(
    item['Is Metric Stream'],
    item['Provider'],
    METRIC_IDS?.TOPICS || '',
    filterSet,
    [],
    timeRange as any,
    { unhealthyClusters },
  );

  const partitionCountQuery = getQueryByProviderAndPreference(
    item['Is Metric Stream'],
    item['Provider'],
    METRIC_IDS?.PARTITIONS_COUNT || '',
    filterSet,
    [],
    timeRange as any,
    { unhealthyClusters },
  );

  queries = [
    { accountId: accountId, query: totalClusterQuery },
    { accountId: accountId, query: unhealthyClustersQuery },
    { accountId: accountId, query: topicsQuery },
    { accountId: accountId, query: partitionCountQuery },
  ];

  if (item['Provider'] === MSK_PROVIDER) {
    const brokersQuery = getQueryByProviderAndPreference(
      item['Is Metric Stream'],
      item['Provider'],
      METRIC_IDS?.BROKERS || '',
      filterSet,
      [],
      timeRange as any,
      { unhealthyClusters },
    );

    queries = [...queries, { accountId: accountId, query: brokersQuery }];
  }

  const {
    loading: entityMetricsLoading,
    e: entityMetricsError,
    EntityMetrics,
  } = useFetchEntityMetrics({
    item,
    show: 'topic',
    filterSet,
  });

  const responses: any[] = useNrqlQueries({
    nrqlQueries: queries,
    timeRange,
    formatType: useNrqlQueries.FORMAT_TYPE.RAW,
    fetchPolicyType: NrqlQuery.FETCH_POLICY_TYPE.NETWORK_ONLY,
    pollInterval: POLL_INTERVAL,
    attributionHeaders: {
      component: 'Message Queues - Summary - Summary - Chart',
      componentId: 'message-queues-summary-summarychart',
    },
    skip: !item,
  });

  let loading = false,
    error = null;
  if (
    responses.filter(
      (res: { loading: boolean; error: any; data: any }) => res?.loading,
    )?.length > 0
  ) {
    loading = true;
  }

  if (loading || entityMetricsLoading)
    return { loading: true, error: null, summaryChartData: [] };

  if (
    responses.filter(
      (res: { loading: boolean; error: any; data: any }) => res?.error,
    )?.length > 0
  ) {
    responses
      .filter((res: { loading: boolean; error: any; data: any }) => !!res.error)
      .forEach((res: { loading: boolean; error: any; data: any }) => {
        instrumentation.noticeError(res.error);
      });
    error = new Error('Error occurred');
  }

  if (error || entityMetricsError)
    return {
      loading: false,
      error: error || entityMetricsError,
      summaryChartData: [],
    };

  const entityGroups = prepareEntityGroups(
    EntityMetrics,
    item.Provider,
    'topic',
  );
  const unHealthyTopics = entityGroups.map((group) =>
    group.counts.filter((entity) => entity.type === ALERT_SEVERITY.WARNING),
  );
  const totalTopics = responses?.[2]?.data?.results?.[0]?.uniqueCount || 0;
  const activeTopics =
    totalTopics - unHealthyTopics.reduce((sum, topic) => sum + topic.length, 0);

  let summaryChartData = [
    responses?.[0]?.data?.results?.[0]?.uniqueCount || 0,
    responses?.[1]?.data?.results?.[0]?.constant || 0,
    totalTopics,
    activeTopics,
    responses?.[3]?.data?.results?.[0]?.uniqueCount ||
      responses?.[3]?.data?.results?.[0]?.sum ||
      0,
  ];

  if (item['Provider'] === MSK_PROVIDER) {
    summaryChartData = [
      ...summaryChartData,
      responses?.[4]?.data?.results?.[0]?.uniqueCount || 0,
    ];
  }

  const [beginTime, endTime] = [
    responses?.[0]?.data?.metadata?.beginTimeMillis,
    responses?.[0]?.data?.metadata?.endTimeMillis,
  ];

  return {
    loading: false,
    error: null,
    summaryChartData,
    beginTime,
    endTime,
    queries,
  };
}
