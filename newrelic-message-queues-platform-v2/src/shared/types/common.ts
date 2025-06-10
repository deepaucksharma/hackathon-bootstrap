/**
 * Common types used throughout the application
 */

export type UUID = string;
export type Timestamp = number;
export type AccountId = string;
export type ProviderType = 'kafka' | 'rabbitmq' | 'activemq' | 'sqs' | 'sns';
export type Environment = 'development' | 'staging' | 'production';
export type PlatformMode = 'infrastructure' | 'simulation' | 'hybrid';

/**
 * Entity GUID structure following New Relic v3.0 specification
 */
export interface EntityGUID {
  readonly accountId: AccountId;
  readonly entityType: string;
  readonly provider: ProviderType;
  readonly domainId: string;
  readonly identifier: string;
}

/**
 * Golden metrics interface
 */
export interface GoldenMetric {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly timestamp: Timestamp;
  readonly tags?: Record<string, string>;
}

/**
 * Relationship between entities
 */
export interface EntityRelationship {
  readonly type: RelationshipType;
  readonly source: string; // Source entity GUID
  readonly target: string; // Target entity GUID
  readonly attributes?: Record<string, unknown>;
}

export enum RelationshipType {
  CONTAINS = 'CONTAINS',
  CONTAINED_IN = 'CONTAINED_IN',
  PRODUCES_TO = 'PRODUCES_TO',
  CONSUMES_FROM = 'CONSUMES_FROM',
  MANAGES = 'MANAGES',
  MANAGED_BY = 'MANAGED_BY'
}

/**
 * Configuration interfaces
 */
export interface BaseConfig {
  readonly environment: Environment;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly metricsEnabled: boolean;
  readonly tracingEnabled: boolean;
}

export interface NewRelicConfig {
  readonly accountId: AccountId;
  readonly apiKey: string;
  readonly ingestKey: string;
  readonly region: 'US' | 'EU';
  readonly endpoint?: string;
}

/**
 * Event interfaces
 */
export interface DomainEvent {
  readonly id: UUID;
  readonly type: string;
  readonly aggregateId: string;
  readonly timestamp: Date;
  readonly version?: number;
  readonly data?: Record<string, unknown>;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Repository interfaces
 */
export interface RepositoryResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: Error;
}

export interface PaginationOptions {
  readonly limit: number;
  readonly offset: number;
  readonly orderBy?: string;
  readonly orderDirection?: 'ASC' | 'DESC';
}

export interface QueryOptions {
  readonly filters?: Record<string, unknown>;
  readonly pagination?: PaginationOptions;
}

/**
 * Health check interfaces
 */
export interface HealthCheck {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly timestamp: Timestamp;
  readonly duration?: number;
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DEGRADED = 'degraded'
}

/**
 * Metrics interfaces
 */
export interface MetricData {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly timestamp: Timestamp;
  readonly labels: Record<string, string>;
}

export interface MetricsCollection {
  readonly timestamp: Timestamp;
  readonly metrics: MetricData[];
  readonly metadata: Record<string, unknown>;
}