export type ErrorCategory =
  | 'VALIDATION_ERROR'
  | 'PERMISSION_ERROR'
  | 'NOT_FOUND'
  | 'BUSINESS_RULE_ERROR'
  | 'INTEGRATION_ERROR'
  | 'SYSTEM_ERROR'
  | 'AUTHENTICATION_ERROR';

export interface ErrorResponseBody {
  success: false;
  errorCode: string;
  message: string;
  details?: string[];
  action?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly category: ErrorCategory;
  public readonly userMessage: string;
  public readonly action?: string;
  public readonly details?: string[];
  public readonly technicalMessage: string;

  constructor(opts: {
    statusCode?: number;
    errorCode: string;
    category: ErrorCategory;
    message: string;
    userMessage?: string;
    action?: string;
    details?: string[];
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'AppError';
    this.statusCode = opts.statusCode ?? categoryToStatus(opts.category);
    this.errorCode = opts.errorCode;
    this.category = opts.category;
    this.technicalMessage = opts.message;
    this.userMessage = opts.userMessage ?? opts.message;
    this.action = opts.action;
    this.details = opts.details;
    if (opts.cause) {
      this.cause = opts.cause;
    }
  }

  toResponse(): ErrorResponseBody {
    const body: ErrorResponseBody = {
      success: false,
      errorCode: this.errorCode,
      message: this.userMessage,
    };
    if (this.details?.length) body.details = this.details;
    if (this.action) body.action = this.action;
    return body;
  }
}

function categoryToStatus(cat: ErrorCategory): number {
  switch (cat) {
    case 'VALIDATION_ERROR': return 400;
    case 'AUTHENTICATION_ERROR': return 401;
    case 'PERMISSION_ERROR': return 403;
    case 'NOT_FOUND': return 404;
    case 'BUSINESS_RULE_ERROR': return 422;
    case 'INTEGRATION_ERROR': return 502;
    case 'SYSTEM_ERROR': return 500;
    default: return 500;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, opts?: { details?: string[]; action?: string; cause?: unknown }) {
    super({
      errorCode: 'VALIDATION_ERROR',
      category: 'VALIDATION_ERROR',
      message,
      userMessage: message,
      action: opts?.action ?? 'Please check the highlighted fields and try again.',
      details: opts?.details,
      cause: opts?.cause,
    });
    this.name = 'ValidationError';
  }
}

export class PermissionError extends AppError {
  constructor(message?: string, opts?: { action?: string; cause?: unknown }) {
    super({
      errorCode: 'PERMISSION_DENIED',
      category: 'PERMISSION_ERROR',
      message: message ?? 'You do not have permission to perform this action.',
      action: opts?.action ?? 'Contact your administrator if you believe this is an error.',
      cause: opts?.cause,
    });
    this.name = 'PermissionError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, identifier?: string | number, opts?: { action?: string }) {
    const idPart = identifier !== undefined ? ` with ID ${identifier}` : '';
    super({
      errorCode: 'NOT_FOUND',
      category: 'NOT_FOUND',
      message: `${entity}${idPart} was not found.`,
      action: opts?.action ?? `Verify the ${entity.toLowerCase()} exists and try again.`,
    });
    this.name = 'NotFoundError';
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, opts?: { errorCode?: string; details?: string[]; action?: string; cause?: unknown }) {
    super({
      errorCode: opts?.errorCode ?? 'BUSINESS_RULE_VIOLATION',
      category: 'BUSINESS_RULE_ERROR',
      message,
      userMessage: message,
      action: opts?.action,
      details: opts?.details,
      cause: opts?.cause,
    });
    this.name = 'BusinessRuleError';
  }
}

export class IntegrationError extends AppError {
  constructor(system: string, technicalMessage: string, opts?: { userMessage?: string; action?: string; cause?: unknown }) {
    super({
      errorCode: 'INTEGRATION_ERROR',
      category: 'INTEGRATION_ERROR',
      message: `${system} integration error: ${technicalMessage}`,
      userMessage: opts?.userMessage ?? `Could not communicate with ${system}. The external service may be temporarily unavailable.`,
      action: opts?.action ?? 'Please try again in a few moments. If the issue persists, contact support.',
      cause: opts?.cause,
    });
    this.name = 'IntegrationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message?: string, opts?: { action?: string }) {
    super({
      errorCode: 'AUTHENTICATION_REQUIRED',
      category: 'AUTHENTICATION_ERROR',
      message: message ?? 'Authentication is required to access this resource.',
      action: opts?.action ?? 'Please log in and try again.',
    });
    this.name = 'AuthenticationError';
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function wrapUnknownError(err: unknown): AppError {
  if (isAppError(err)) return err;

  const message = err instanceof Error ? err.message : String(err);

  const lm = message.toLowerCase();
  if (lm.includes('unique constraint') || lm.includes('duplicate key')) {
    return new ValidationError('A record with this information already exists.', {
      action: 'Check for duplicates and try again.',
      cause: err,
    });
  }
  if (lm.includes('foreign key') || lm.includes('violates foreign key')) {
    return new BusinessRuleError(
      'This record is referenced by other data and cannot be modified.',
      { action: 'Remove dependent records first and try again.', cause: err }
    );
  }
  if (lm.includes('not null') || lm.includes('null value in column')) {
    const colMatch = message.match(/column "(\w+)"/);
    const col = colMatch ? colMatch[1] : 'required field';
    return new ValidationError(`A required field (${col}) is missing.`, {
      action: 'Fill in all required fields and try again.',
      cause: err,
    });
  }
  if (lm.includes('timeout') || lm.includes('econnrefused') || lm.includes('enotfound')) {
    return new IntegrationError('External Service', message, {
      userMessage: 'The server could not reach an external service. Please try again shortly.',
      cause: err,
    });
  }

  return new AppError({
    errorCode: 'INTERNAL_ERROR',
    category: 'SYSTEM_ERROR',
    message,
    userMessage: 'An unexpected error occurred. Our team has been notified.',
    action: 'Please try again. If the issue persists, contact support.',
    cause: err,
  });
}
