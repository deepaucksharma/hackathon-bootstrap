/**
 * Configuration Types
 */

export type PlatformMode = 'infrastructure' | 'simulation' | 'hybrid';
export type Region = 'US' | 'EU';

export interface PlatformConfig {
  // Required
  accountId: string;
  apiKey: string;
  ingestKey?: string; // For Event API
  
  // Mode
  mode?: PlatformMode;
  platformMode?: PlatformMode; // Alternative name
  
  // Collection
  interval: number; // seconds
  lookbackMinutes?: number; // for infrastructure mode
  
  // Provider
  provider: string;
  
  // New Relic
  region: Region;
  userApiKey?: string; // for dashboard creation
  
  // Environment
  environment?: string;
  
  // Simulation options
  simulationClusters?: number;
  simulationBrokers?: number;
  simulationTopics?: number;
  simulationConsumerGroups?: number;
  
  // Advanced options
  batchSize?: number;
  enableDebug?: boolean;
  enableMetrics?: boolean;
}

export interface CollectorConfig extends PlatformConfig {
  // Additional collector-specific config
}

export interface TransformerConfig extends PlatformConfig {
  // Additional transformer-specific config
}

export interface StreamerConfig extends PlatformConfig {
  endpoint?: string;
  timeout?: number;
  retries?: number;
}