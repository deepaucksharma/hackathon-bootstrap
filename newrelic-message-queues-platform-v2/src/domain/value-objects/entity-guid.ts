/**
 * Entity GUID value object
 * Represents a New Relic v3.0 compliant entity GUID
 */

import { createHash } from 'crypto';
import type { AccountId, ProviderType } from '@shared/types/common.js';
import { ValidationError } from '@shared/errors/base.js';

export class EntityGUID {
  private readonly _value: string;
  private readonly _accountId: AccountId;
  private readonly _entityType: string;
  private readonly _provider: ProviderType;
  private readonly _domainId: string;
  private readonly _identifier: string;

  constructor(
    accountId: AccountId,
    entityType: string,
    provider: ProviderType,
    domainId: string,
    identifier: string,
    ...additionalIdentifiers: string[]
  ) {
    this.validateInputs(accountId, entityType, provider, domainId, identifier);
    
    this._accountId = accountId;
    this._entityType = entityType;
    this._provider = provider;
    this._domainId = domainId;
    this._identifier = identifier;
    this._value = this.buildGUID([provider, domainId, identifier, ...additionalIdentifiers]);
  }

  /**
   * Create from string representation
   */
  public static fromString(guid: string): EntityGUID {
    const parts = guid.split('|');
    
    if (parts.length !== 4) {
      throw new ValidationError('Invalid GUID format. Expected format: accountId|INFRA|entityType|uniqueHash');
    }

    const [accountId, infra, entityType, uniqueHash] = parts;
    
    if (infra !== 'INFRA') {
      throw new ValidationError('Invalid GUID format. Second component must be INFRA');
    }
    
    // We can't reconstruct the original identifiers from the hash, so we'll create a placeholder
    // In a real implementation, you'd need to look up the entity by GUID to get the original identifiers
    return new EntityGUID(
      accountId,
      entityType,
      'unknown' as ProviderType,
      'unknown',
      uniqueHash
    );
  }

  /**
   * Get the complete GUID string
   */
  public get value(): string {
    return this._value;
  }

  /**
   * Get account ID
   */
  public get accountId(): AccountId {
    return this._accountId;
  }

  /**
   * Get entity type
   */
  public get entityType(): string {
    return this._entityType;
  }

  /**
   * Get provider
   */
  public get provider(): ProviderType {
    return this._provider;
  }

  /**
   * Get domain ID
   */
  public get domainId(): string {
    return this._domainId;
  }

  /**
   * Get identifier
   */
  public get identifier(): string {
    return this._identifier;
  }

  /**
   * Check equality with another EntityGUID
   */
  public equals(other: EntityGUID): boolean {
    return this._value === other._value;
  }

  /**
   * Convert to string representation
   */
  public toString(): string {
    return this._value;
  }

  /**
   * Convert to JSON representation
   */
  public toJSON(): Record<string, unknown> {
    return {
      guid: this._value,
      accountId: this._accountId,
      entityType: this._entityType,
      provider: this._provider,
      domainId: this._domainId,
      identifier: this._identifier
    };
  }

  private validateInputs(
    accountId: AccountId,
    entityType: string,
    provider: ProviderType,
    domainId: string,
    identifier: string
  ): void {
    if (!accountId || accountId.trim().length === 0) {
      throw new ValidationError('Account ID is required');
    }

    if (!entityType || entityType.trim().length === 0) {
      throw new ValidationError('Entity type is required');
    }

    if (!entityType.startsWith('MESSAGE_QUEUE_')) {
      throw new ValidationError('Entity type must start with MESSAGE_QUEUE_');
    }

    if (!provider || provider.trim().length === 0) {
      throw new ValidationError('Provider is required');
    }

    if (!domainId || domainId.trim().length === 0) {
      throw new ValidationError('Domain ID is required');
    }

    if (!identifier || identifier.trim().length === 0) {
      throw new ValidationError('Identifier is required');
    }

    // Check for invalid characters (no pipes allowed in components)
    const components = [accountId, entityType, provider, domainId, identifier];
    for (const component of components) {
      if (component.includes('|')) {
        throw new ValidationError('GUID components cannot contain pipe character (|)');
      }
    }
  }

  private buildGUID(identifiers: string[]): string {
    // Build composite key from hierarchical identifiers
    const compositeKey = identifiers.filter(Boolean).join(':');
    
    // Generate SHA256 hash and take first 32 characters
    const uniqueHash = createHash('sha256')
      .update(compositeKey)
      .digest('hex')
      .substring(0, 32);
    
    // Follow New Relic v3.0 specification format: {accountId}|INFRA|{entityType}|{uniqueHash}
    return `${this._accountId}|INFRA|${this._entityType}|${uniqueHash}`;
  }
}