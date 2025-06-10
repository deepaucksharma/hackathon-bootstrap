/**
 * Event bus for decoupled communication between components
 */

import { EventEmitter } from 'eventemitter3';
import { injectable } from 'inversify';
import type { DomainEvent, UUID } from '@shared/types/common.js';
import { Logger } from '@shared/utils/logger.js';

export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void> | void;
}

export interface EventSubscription {
  readonly id: UUID;
  readonly eventType: string;
  readonly handler: EventHandler;
  readonly once?: boolean;
}

@injectable()
export class EventBus {
  private readonly emitter: EventEmitter;
  private readonly subscriptions: Map<string, EventSubscription[]>;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.emitter = new EventEmitter();
    this.subscriptions = new Map();
    this.logger = logger;
  }

  /**
   * Publish an event to all subscribers
   */
  public async publish<T extends DomainEvent>(event: T): Promise<void> {
    this.logger.debug('Publishing event', {
      eventType: event.type,
      eventId: event.id,
      aggregateId: event.aggregateId
    });

    const handlers = this.subscriptions.get(event.type) || [];
    
    // Execute all handlers concurrently
    const promises = handlers.map(async (subscription) => {
      try {
        await subscription.handler.handle(event);
        
        // Remove one-time subscriptions
        if (subscription.once) {
          this.unsubscribe(subscription.id);
        }
      } catch (error) {
        this.logger.error('Event handler failed', {
          eventType: event.type,
          eventId: event.id,
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error)
        });
        // Don't rethrow - we don't want one failing handler to break others
      }
    });

    await Promise.allSettled(promises);
    
    this.logger.debug('Event processing completed', {
      eventType: event.type,
      eventId: event.id,
      handlerCount: handlers.length
    });
  }

  /**
   * Subscribe to events of a specific type
   */
  public subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>,
    options: { once?: boolean } = {}
  ): UUID {
    const subscription: EventSubscription = {
      id: crypto.randomUUID(),
      eventType,
      handler: handler as EventHandler,
      once: options.once
    };

    const existing = this.subscriptions.get(eventType) || [];
    this.subscriptions.set(eventType, [...existing, subscription]);

    this.logger.debug('Event subscription added', {
      eventType,
      subscriptionId: subscription.id,
      once: options.once
    });

    return subscription.id;
  }

  /**
   * Subscribe to an event once
   */
  public once<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): UUID {
    return this.subscribe(eventType, handler, { once: true });
  }

  /**
   * Unsubscribe from events
   */
  public unsubscribe(subscriptionId: UUID): boolean {
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      const index = subscriptions.findIndex(s => s.id === subscriptionId);
      if (index !== -1) {
        subscriptions.splice(index, 1);
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType);
        }
        
        this.logger.debug('Event subscription removed', {
          eventType,
          subscriptionId
        });
        
        return true;
      }
    }
    
    return false;
  }

  /**
   * Unsubscribe all handlers for an event type
   */
  public unsubscribeAll(eventType: string): void {
    const subscriptions = this.subscriptions.get(eventType);
    if (subscriptions) {
      this.subscriptions.delete(eventType);
      this.logger.debug('All subscriptions removed for event type', { eventType });
    }
  }

  /**
   * Get subscription statistics
   */
  public getStats(): Record<string, unknown> {
    const eventTypes: Record<string, { subscriptionCount: number; onceSubscriptions: number }> = {};

    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      eventTypes[eventType] = {
        subscriptionCount: subscriptions.length,
        onceSubscriptions: subscriptions.filter(s => s.once).length
      };
    }

    return {
      totalEventTypes: this.subscriptions.size,
      eventTypes
    };
  }

  /**
   * Clear all subscriptions
   */
  public clear(): void {
    this.subscriptions.clear();
    this.emitter.removeAllListeners();
    this.logger.debug('All event subscriptions cleared');
  }
}