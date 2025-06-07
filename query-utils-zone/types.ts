export interface StaticInfo {
  unhealthyClusters?: number;
  filterClusterMetric?: string;
  filterBrokerMetric?: string;
  filterTopicMetric?: string;
}

export type Mutable<T> = ExpandRecursively<{
  -readonly [K in keyof T]: T[K] extends object
    ? Mutable<T[K]>
    : T[K] extends readonly (infer R)[]
      ? R[]
      : T[K];
}>;

type ExpandRecursively<T> = T extends object
  ? T extends (...args: any[]) => any
    ? T
    : { [K in keyof T]: ExpandRecursively<T[K]> }
  : T;

export type MessageQueueMetaRowItem = Mutable<{
  'Name': Array<string>;
  'Clusters': string;
  'Health': string[] | number[];
  'Incoming Throughput': number;
  'Outgoing Throughput': number;
  'Provider': string;
  'Account Name': string;
  'Account Id': number;
  'Is Healthy': boolean;
  'Is Metric Stream': boolean;
  'Unhealthy Clusters': number;
  'hasError': boolean;
}>;

export type Entity = Mutable<{
  alertSeverity: string;
  guid: string;
  name: string;
  permalink: string;
}>;

export type TopicRowItem = Mutable<{
  'Name': string;
  'APM entity': number;
  'apmGuids': string[];
  'Topic Name': string;
  'guid': string;
  'Incoming Throughput': string;
  'Outgoing Throughput': string;
  'Message rate': string;
  'alertSeverity': string;
  'reporting': boolean;
  'permalink': string;
}>;

export type QueryOptions = {
  [key: string]: any;
};

export type QueryModelMap = {
  [key: string]: QueryModel;
};

export type DimensionMap = {
  [key: string]: {
    column: number;
    row: number;
    width: number;
    height: number;
  };
};

export type QueryModel = {
  from: string | QueryModel;
  select: string[];
  facet?: string[];
  where?: string[];
  timeRange?: TimeRanges;
  limit?: number | 'MAX';
  isNested?: boolean;
  isTimeseries?: boolean;
  metricType?: string;
};

export type ConfigModel = {
  id: string;
  title: string;
  dimensions: DimensionMap;
  prodivers: string[];
  chartType: string;
  query?: string;
};

export interface EntityMetrics {
  metrics: Metric[];
  [key: string]: string | Metric[];
}
export interface Metric {
  name: string;
  value: number;
}

export type SearchSelectItemType = {
  description?: string;
  subtype?: string;
};
