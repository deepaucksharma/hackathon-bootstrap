/* eslint @typescript-eslint/no-unused-vars: 0 */

import {
  METRIC_IDS,
  MSK_PROVIDER,
  PROVIDERS_ID_MAP,
} from '../config/constants';
import { ConfigModel, StaticInfo } from '../types/types';

import { getQueryByProviderAndPreference } from './query-utils';

export function makeMosaicTemplate(
  isPreferMetrics: boolean,
  metrics: ConfigModel[],
  accountId: string,
  provider: string,
  filterSet: any,
  facet: string[],
  timeRange: TimeRanges,
  staticInfo: StaticInfo,
) {
  return getTemplate(
    isPreferMetrics,
    metrics,
    accountId,
    provider,
    filterSet,
    facet,
    timeRange,
    staticInfo,
  );
}

function getTemplate(
  isPreferMetrics: boolean,
  metrics: ConfigModel[],
  accountId: string,
  provider: string,
  filterSet: any,
  facet: string[],
  timeRange: TimeRanges,
  staticInfo: StaticInfo,
) {
  const pages = getPage(
    isPreferMetrics,
    metrics,
    accountId,
    provider,
    filterSet,
    facet,
    timeRange,
    staticInfo,
  );

  return {
    name: 'mosaic',
    pages: [pages],
  };
}

function getPage(
  isPreferMetrics: boolean,
  metrics: ConfigModel[],
  accountId: string,
  provider: string,
  filterSet: any,
  facet: string[],
  timeRange: TimeRanges,
  staticInfo: StaticInfo,
) {
  const widgets: any = Object.values(metrics).map((metric: ConfigModel) =>
    getWidget(
      accountId,
      isPreferMetrics,
      provider,
      metric,
      filterSet,
      facet,
      timeRange,
      staticInfo,
    ),
  );

  return {
    name: 'mosaic',
    description: null,
    widgets: widgets,
  };
}

function getWidget(
  accountId: string,
  isPreferMetrics: boolean,
  provider: string,
  metric: ConfigModel | undefined,
  filterSet: any,
  facet: string[],
  timeRange: TimeRanges,
  staticInfo: StaticInfo,
): any {
  if (!metric) {
    return null;
  }

  let queries = [];
  if (metric.id === METRIC_IDS.SUMMARY && provider === MSK_PROVIDER) {
    const totalClusterQuery = getQueryByProviderAndPreference(
      isPreferMetrics,
      provider,
      METRIC_IDS.TOTAL_CLUSTERS,
      filterSet,
      facet,
      timeRange,
      staticInfo,
    );
    const unhealthyClustersQuery = getQueryByProviderAndPreference(
      isPreferMetrics,
      provider,
      METRIC_IDS.UNHEALTHY_CLUSTERS,
      filterSet,
      facet,
      timeRange,
      staticInfo,
    );
    const brokersQuery = getQueryByProviderAndPreference(
      isPreferMetrics,
      provider,
      METRIC_IDS.BROKERS,
      filterSet,
      facet,
      timeRange,
      staticInfo,
    );

    const partitionCountQuery = getQueryByProviderAndPreference(
      isPreferMetrics,
      provider,
      METRIC_IDS.PARTITIONS_COUNT,
      filterSet,
      facet,
      timeRange,
      staticInfo,
    );
    const topicsQuery = getQueryByProviderAndPreference(
      isPreferMetrics,
      provider,
      METRIC_IDS.TOPICS,
      filterSet,
      facet,
      timeRange,
      staticInfo,
    );
    queries = [
      { accountId: accountId, query: totalClusterQuery },
      { accountId: accountId, query: unhealthyClustersQuery },
      { accountId: accountId, query: brokersQuery },
      { accountId: accountId, query: partitionCountQuery },
      { accountId: accountId, query: topicsQuery },
    ];
  } else {
    queries = [
      {
        accountId: accountId,
        query: getQueryByProviderAndPreference(
          isPreferMetrics,
          provider,
          metric?.id || '',
          filterSet,
          facet,
          timeRange,
          staticInfo,
        ),
      },
    ];
  }

  return {
    title: metric.title,
    layout: {
      column: metric.dimensions[provider].column,
      row: metric.dimensions[provider].row,
      width: metric.dimensions[provider].width,
      height: metric.dimensions[provider].height || 10,
    },
    linkedEntityGuids: null,
    visualization: {
      id: metric.chartType,
    },
    rawConfiguration: {
      facet: {
        showOtherSeries: false,
      },
      legend: {
        enabled: true,
      },
      nrqlQueries: queries,
    },
  };
}
