/**
 * Base error classes for the application
 */

export abstract class BaseError extends Error {
  public abstract readonly code: string;
  public abstract readonly statusCode: number;
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    this.context = context;
    
    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Domain-specific errors
 */
export class DomainError extends BaseError {
  public readonly code = 'DOMAIN_ERROR';
  public readonly statusCode = 400;
}

export class ValidationError extends BaseError {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 400;
}

export class NotFoundError extends BaseError {
  public readonly code = 'NOT_FOUND';
  public readonly statusCode = 404;
}

export class ConflictError extends BaseError {
  public readonly code = 'CONFLICT';
  public readonly statusCode = 409;
}

/**
 * Infrastructure errors
 */
export class InfrastructureError extends BaseError {
  public readonly code = 'INFRASTRUCTURE_ERROR';
  public readonly statusCode = 500;
}

export class ExternalServiceError extends BaseError {
  public readonly code = 'EXTERNAL_SERVICE_ERROR';
  public readonly statusCode = 502;
}

export class ConfigurationError extends BaseError {
  public readonly code = 'CONFIGURATION_ERROR';
  public readonly statusCode = 500;
}

export class NetworkError extends BaseError {
  public readonly code = 'NETWORK_ERROR';
  public readonly statusCode = 503;
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends BaseError {
  public readonly code = 'AUTHENTICATION_ERROR';
  public readonly statusCode = 401;
}

export class AuthorizationError extends BaseError {
  public readonly code = 'AUTHORIZATION_ERROR';
  public readonly statusCode = 403;
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends BaseError {
  public readonly code = 'RATE_LIMIT_ERROR';
  public readonly statusCode = 429;
}

/**
 * Timeout errors
 */
export class TimeoutError extends BaseError {
  public readonly code = 'TIMEOUT_ERROR';
  public readonly statusCode = 408;
}

/**
 * Circuit breaker errors
 */
export class CircuitBreakerError extends BaseError {
  public readonly code = 'CIRCUIT_BREAKER_ERROR';
  public readonly statusCode = 503;
}

/**
 * Error factory for creating typed errors
 */
export class ErrorFactory {
  public static domain(message: string, context?: Record<string, unknown>): DomainError {
    return new DomainError(message, context);
  }

  public static validation(message: string, context?: Record<string, unknown>): ValidationError {
    return new ValidationError(message, context);
  }

  public static notFound(message: string, context?: Record<string, unknown>): NotFoundError {
    return new NotFoundError(message, context);
  }

  public static infrastructure(message: string, context?: Record<string, unknown>): InfrastructureError {
    return new InfrastructureError(message, context);
  }

  public static externalService(message: string, context?: Record<string, unknown>): ExternalServiceError {
    return new ExternalServiceError(message, context);
  }

  public static configuration(message: string, context?: Record<string, unknown>): ConfigurationError {
    return new ConfigurationError(message, context);
  }

  public static authentication(message: string, context?: Record<string, unknown>): AuthenticationError {
    return new AuthenticationError(message, context);
  }

  public static authorization(message: string, context?: Record<string, unknown>): AuthorizationError {
    return new AuthorizationError(message, context);
  }

  public static timeout(message: string, context?: Record<string, unknown>): TimeoutError {
    return new TimeoutError(message, context);
  }

  public static rateLimit(message: string, context?: Record<string, unknown>): RateLimitError {
    return new RateLimitError(message, context);
  }

  public static notImplemented(message: string, context?: Record<string, unknown>): InfrastructureError {
    return new InfrastructureError(`Not implemented: ${message}`, context);
  }
}