/**
 * Golden Metric value object
 * Represents a key performance indicator for message queue entities
 */

import type { Timestamp } from '@shared/types/common.js';
import { ValidationError } from '@shared/errors/base.js';

export type MetricUnit = 
  | 'count'
  | 'percentage'
  | 'bytes'
  | 'bytes/second'
  | 'messages/second'
  | 'milliseconds'
  | 'seconds'
  | 'messages'
  | 'commits/second'
  | 'rebalances/hour';

export class GoldenMetric {
  private readonly _name: string;
  private readonly _value: number;
  private readonly _unit: MetricUnit;
  private readonly _timestamp: Timestamp;
  private readonly _tags: ReadonlyMap<string, string>;
  private readonly _description?: string;

  constructor(
    name: string,
    value: number,
    unit: MetricUnit,
    timestamp?: Timestamp,
    tags?: Record<string, string>,
    description?: string
  ) {
    this.validateInputs(name, value, unit);
    
    this._name = name;
    this._value = value;
    this._unit = unit;
    this._timestamp = timestamp || Date.now();
    this._tags = new Map(Object.entries(tags || {}));
    this._description = description;
  }

  /**
   * Create a count metric
   */
  public static count(name: string, value: number, tags?: Record<string, string>): GoldenMetric {
    return new GoldenMetric(name, value, 'count', undefined, tags);
  }

  /**
   * Create a percentage metric
   */
  public static percentage(name: string, value: number, tags?: Record<string, string>): GoldenMetric {
    return new GoldenMetric(name, value, 'percentage', undefined, tags);
  }

  /**
   * Create a throughput metric (messages/second)
   */
  public static throughput(name: string, value: number, tags?: Record<string, string>): GoldenMetric {
    return new GoldenMetric(name, value, 'messages/second', undefined, tags);
  }

  /**
   * Create a latency metric (milliseconds)
   */
  public static latency(name: string, value: number, tags?: Record<string, string>): GoldenMetric {
    return new GoldenMetric(name, value, 'milliseconds', undefined, tags);
  }

  /**
   * Create a bytes metric
   */
  public static bytes(name: string, value: number, tags?: Record<string, string>): GoldenMetric {
    return new GoldenMetric(name, value, 'bytes', undefined, tags);
  }

  /**
   * Create a byte rate metric (bytes/second)
   */
  public static byteRate(name: string, value: number, tags?: Record<string, string>): GoldenMetric {
    return new GoldenMetric(name, value, 'bytes/second', undefined, tags);
  }

  /**
   * Create a generic rate metric (per second)
   */
  public static rate(name: string, value: number, unit: MetricUnit = 'messages/second', tags?: Record<string, string>): GoldenMetric {
    return new GoldenMetric(name, value, unit, undefined, tags);
  }

  /**
   * Get metric name
   */
  public get name(): string {
    return this._name;
  }

  /**
   * Get metric value
   */
  public get value(): number {
    return this._value;
  }

  /**
   * Get metric unit
   */
  public get unit(): MetricUnit {
    return this._unit;
  }

  /**
   * Get timestamp
   */
  public get timestamp(): Timestamp {
    return this._timestamp;
  }

  /**
   * Get tags
   */
  public get tags(): ReadonlyMap<string, string> {
    return this._tags;
  }

  /**
   * Get description
   */
  public get description(): string | undefined {
    return this._description;
  }

  /**
   * Get tag value by key
   */
  public getTag(key: string): string | undefined {
    return this._tags.get(key);
  }

  /**
   * Check if metric has a specific tag
   */
  public hasTag(key: string): boolean {
    return this._tags.has(key);
  }

  /**
   * Create a new metric with additional tags
   */
  public withTags(additionalTags: Record<string, string>): GoldenMetric {
    const combinedTags = {
      ...Object.fromEntries(this._tags),
      ...additionalTags
    };
    
    return new GoldenMetric(
      this._name,
      this._value,
      this._unit,
      this._timestamp,
      combinedTags,
      this._description
    );
  }

  /**
   * Create a new metric with a different value
   */
  public withValue(newValue: number): GoldenMetric {
    return new GoldenMetric(
      this._name,
      newValue,
      this._unit,
      Date.now(), // Update timestamp when value changes
      Object.fromEntries(this._tags),
      this._description
    );
  }

  /**
   * Check if metric is stale (older than threshold)
   */
  public isStale(thresholdMs: number = 300000): boolean { // 5 minutes default
    return Date.now() - this._timestamp > thresholdMs;
  }

  /**
   * Check equality with another metric
   */
  public equals(other: GoldenMetric): boolean {
    return (
      this._name === other._name &&
      this._value === other._value &&
      this._unit === other._unit &&
      this._timestamp === other._timestamp &&
      this.tagsEqual(other._tags)
    );
  }

  /**
   * Convert to JSON representation
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this._name,
      value: this._value,
      unit: this._unit,
      timestamp: this._timestamp,
      tags: Object.fromEntries(this._tags),
      description: this._description
    };
  }

  /**
   * Convert to New Relic event attribute format
   */
  public toEventAttribute(): Record<string, unknown> {
    return {
      [this._name]: this._value
    };
  }

  private validateInputs(name: string, value: number, unit: MetricUnit): void {
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Metric name is required');
    }

    if (typeof value !== 'number' || !isFinite(value)) {
      throw new ValidationError('Metric value must be a finite number');
    }

    if (unit === 'percentage' && (value < 0 || value > 100)) {
      throw new ValidationError('Percentage metrics must be between 0 and 100');
    }

    if (['count', 'bytes', 'messages'].includes(unit) && value < 0) {
      throw new ValidationError(`${unit} metrics cannot be negative`);
    }
  }

  private tagsEqual(otherTags: ReadonlyMap<string, string>): boolean {
    if (this._tags.size !== otherTags.size) {
      return false;
    }

    for (const [key, value] of this._tags) {
      if (otherTags.get(key) !== value) {
        return false;
      }
    }

    return true;
  }
}