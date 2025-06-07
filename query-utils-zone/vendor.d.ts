declare module '@datanerd/shared-component-product-empty-state';
declare module '@datanerd/nr-ui-legacy';
declare module '@datanerd/mosaic';
declare module '@datanerd/nrql-model';
declare module 'nr1';
declare module 'classnames';
declare module '@datanerd/shared-component-mini-overview' {
  import { Component } from 'react';
  import { Nr1Object } from '@datanerd/wanda-ts-generator';

  export interface MiniOverviewProps {
    nr1: Nr1Object;
    guid: string;
    onTagSelected: (tag: { key: string; value: string }) => void;
    onEntitySelected: (guid: string) => void;
  }

  export class MiniOverview extends Component<MiniOverviewProps> {}
}

declare module '@datanerd/shared-component-filter-bar-dynamic' {
  export const GroupByFilter;
  export const FilterBarComponent;
  export const DynamicFilterBar;
  export const setupFilterSet;
  export const FilterTypes;
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare module '@datanerd/vizco';
