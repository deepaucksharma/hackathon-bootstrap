/**
 * Base entity for all domain entities
 */

import type { UUID, Timestamp, DomainEvent } from '@shared/types/common.js';

export abstract class BaseEntity {
  protected readonly _id: UUID;
  protected readonly _createdAt: Timestamp;
  protected _updatedAt: Timestamp;
  protected _version: number;
  private _domainEvents: DomainEvent[];

  constructor(id?: UUID) {
    this._id = id || crypto.randomUUID();
    this._createdAt = Date.now();
    this._updatedAt = this._createdAt;
    this._version = 1;
    this._domainEvents = [];
  }

  /**
   * Entity ID (immutable)
   */
  public get id(): UUID {
    return this._id;
  }

  /**
   * Creation timestamp (immutable)
   */
  public get createdAt(): Timestamp {
    return this._createdAt;
  }

  /**
   * Last update timestamp
   */
  public get updatedAt(): Timestamp {
    return this._updatedAt;
  }

  /**
   * Entity version for optimistic locking
   */
  public get version(): number {
    return this._version;
  }

  /**
   * Domain events accumulated by this entity
   */
  public get domainEvents(): ReadonlyArray<DomainEvent> {
    return [...this._domainEvents];
  }

  /**
   * Mark entity as modified
   */
  protected markModified(): void {
    this._updatedAt = Date.now();
    this._version += 1;
  }

  /**
   * Add a domain event
   */
  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /**
   * Clear all domain events
   */
  public clearDomainEvents(): void {
    this._domainEvents = [];
  }

  /**
   * Create a domain event for this entity
   */
  protected createDomainEvent(
    type: string,
    data: Record<string, unknown>
  ): DomainEvent {
    return {
      id: crypto.randomUUID(),
      type,
      aggregateId: this._id,
      timestamp: Date.now(),
      version: this._version,
      data
    };
  }

  /**
   * Equality comparison based on ID
   */
  public equals(other: BaseEntity): boolean {
    if (!(other instanceof BaseEntity)) {
      return false;
    }
    return this._id === other._id;
  }

  /**
   * Convert to plain object for serialization
   */
  public abstract toJSON(): Record<string, unknown>;

  /**
   * Validate entity state
   */
  public abstract validate(): void;
}