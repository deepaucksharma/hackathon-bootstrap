import { instrumentation, useNrqlQueries } from 'nr1';

import {
  EntityMetrics,
  MessageQueueMetaRowItem,
  Metric,
} from '../../types/types';
import {
  ALERT_SEVERITY_ORDER,
  getEntityHealth,
  accountDeletedUIMessage,
  deletedAccountClusterMessages,
} from '../../utils/data-utils';
import {
  CONFLUENT_CLOUD_DIM_QUERIES,
  DIM_QUERIES,
  getQueryString,
  MTS_QUERIES,
  getIntegrationType,
  getModifiedFilterSetForTags,
} from '../../utils/query-utils';
import { CONFLUENT_CLOUD_PROVIDER, MSK_PROVIDER } from '../../config/constants';

export function useFetchEntityMetrics({
  item,
  filterSet,
  show = 'cluster',
  groupBy,
  updateItems,
}: {
  item: MessageQueueMetaRowItem;
  show: string;
  groupBy?: string;
  filterSet?: any[];
  updateItems?: any;
}): {
  loading: boolean;
  e: any;
  EntityMetrics: EntityMetrics[];
} {
  const accountId = item['Account Id'];
  const isMetricStream = item['Is Metric Stream'];

  let baseHealthQuery: any = isMetricStream
    ? MTS_QUERIES[`${show.toUpperCase()}_HEALTH_QUERY`]
    : item.Provider === CONFLUENT_CLOUD_PROVIDER
      ? CONFLUENT_CLOUD_DIM_QUERIES[`${show.toUpperCase()}_HEALTH_QUERY`]
      : DIM_QUERIES[`${show.toUpperCase()}_HEALTH_QUERY`];

  baseHealthQuery = groupBy
    ? isMetricStream
      ? MTS_QUERIES[`${show.toUpperCase()}_GROUPBY_${groupBy.toUpperCase()}`]
      : item.Provider === CONFLUENT_CLOUD_PROVIDER
        ? CONFLUENT_CLOUD_DIM_QUERIES[
            `${show.toUpperCase()}_GROUPBY_${groupBy.toUpperCase()}`
          ]
        : DIM_QUERIES[`${show.toUpperCase()}_GROUPBY_${groupBy.toUpperCase()}`]
    : baseHealthQuery;

  const modifiedFilterSet = getModifiedFilterSetForTags(filterSet || []);

  if (filterSet && filterSet.length > 0) {
    baseHealthQuery = {
      ...baseHealthQuery,
      where: [...modifiedFilterSet, ...(baseHealthQuery?.where || [])],
    };
  }

  baseHealthQuery = getQueryString(
    baseHealthQuery,
    getIntegrationType(item),
    true,
    modifiedFilterSet,
  );
  let baseBrokerQuery: any = '';
  if (item.Provider === MSK_PROVIDER && show === 'cluster') {
    baseBrokerQuery = isMetricStream
      ? MTS_QUERIES[`${show.toUpperCase()}_HEALTH_QUERY_BY_BROKER`]
      : DIM_QUERIES[`${show.toUpperCase()}_HEALTH_QUERY_BY_BROKER`];
  }
  if (filterSet && filterSet.length > 0) {
    baseBrokerQuery = {
      ...baseBrokerQuery,
      where: [...modifiedFilterSet, ...(baseBrokerQuery?.where || [])],
    };
  }

  baseBrokerQuery = getQueryString(
    baseBrokerQuery,
    getIntegrationType(item),
    true,
    modifiedFilterSet,
  );
  const nrqlQueries = [
    {
      accountIds: [accountId],
      query: baseHealthQuery,
    },
  ];

  if (item.Provider === MSK_PROVIDER && show === 'cluster') {
    nrqlQueries.push({
      accountIds: [accountId],
      query: baseBrokerQuery,
    });
  }

  const responses: {
    loading: boolean;
    error: any;
    data: any;
  }[] = useNrqlQueries({
    nrqlQueries,
    formatType: useNrqlQueries.FORMAT_TYPE.RAW,
    pollInterval: 60 * 1000,
    attributionHeaders: {
      component: 'Message Queues - Fetch - Entity - Metrics',
      componentId: 'message-queues-fetch-entity-metrics',
    },
  });

  try {
    if (
      responses.filter(
        (res: { loading: boolean; error: any; data: any }) => res?.loading,
      )?.length > 0
    ) {
      return { loading: true, EntityMetrics: [], e: null };
    }

    if (
      responses.filter(
        (res: { loading: boolean; error: any; data: any }) => !!res.error,
      ).length > 0
    ) {
      let isDeletedAccountError = false;
      responses
        .filter(
          (res: { loading: boolean; error: any; data: any }) => !!res.error,
        )
        .forEach((res: { loading: boolean; error: any; data: any }) => {
          if (deletedAccountClusterMessages.includes(res?.error?.message))
            isDeletedAccountError = true;
          instrumentation.noticeError(res.error);
        });
      if (item && updateItems && !item?.hasError) {
        updateItems(true, 'hasError', {
          ...item,
          hasError: true,
        });
      }
      return {
        loading: false,
        EntityMetrics: [],
        e: isDeletedAccountError
          ? new Error(accountDeletedUIMessage)
          : new Error('Error occurred'),
      };
    }

    const values = (
      responses.length > 1
        ? [responses[0]?.data, responses[1]?.data]
        : [responses[0]?.data]
    ).map((d: any, queryIndex: number) => {
      const keys = (d?.metadata?.contents?.contents || []).map(
        (c: any) => c?.alias,
      );
      return (d?.facets || []).map((f: any) => {
        const m: Metric[] = [];
        (f?.results || []).forEach((r: any, index: number) => {
          if (!keys[index]) return;
          m.push({
            name: keys?.[index],
            value:
              item.Provider === CONFLUENT_CLOUD_PROVIDER && show === 'cluster'
                ? r.average || r.result
                : queryIndex === 0
                  ? r.latest || 0
                  : r.count || r.latest || 0,
          });
        });
        return {
          [show]: f?.name,
          metrics: m,
        };
      });
    });

    if (item && updateItems && item?.hasError) {
      updateItems(false, 'hasError', {
        ...item,
        hasError: false,
      });
    }
    return {
      loading: false,
      EntityMetrics:
        values.length > 1
          ? (values?.[0] || []).map((v: any) => {
              const y = (values?.[1] || []).find(
                (v2: any) => v2[show] === v[show],
              );
              if (!v.metrics[0])
                throw new Error('v.metrics data is unavailable');
              if (!y || !y.metrics)
                throw new Error('y is undefined or y.metrics is undefined');
              return { ...v, metrics: [...v?.metrics, ...y?.metrics] };
            })
          : (values?.[0] || []).sort((a: EntityMetrics, b: EntityMetrics) => {
              const order =
                ALERT_SEVERITY_ORDER[getEntityHealth(a, item.Provider, show)] -
                ALERT_SEVERITY_ORDER[getEntityHealth(b, item.Provider, show)];
              if (groupBy) {
                return ((b[show] as Metric[]).join('') || '').localeCompare(
                  (a[show] as Metric[]).join('') || '',
                );
              }
              if (order === 0 && !groupBy) {
                return ((b[show] as string) || '').localeCompare(
                  (a[show] as string) || '',
                );
              }
              return order;
            }),
      e: null,
    };
  } catch (e: any) {
    if (item && updateItems && item?.hasError) {
      updateItems(false, 'hasError', {
        ...item,
        hasError: false,
      });
    }
    instrumentation.noticeError(e);
    if (item && updateItems && !item?.hasError) {
      updateItems(true, 'hasError', {
        ...item,
        hasError: true,
      });
    }
    return {
      loading: false,
      EntityMetrics: [],
      e: new Error('Error occurred'),
    };
  }
}
