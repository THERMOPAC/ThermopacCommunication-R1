import { Response } from 'express';
import { AppError, isAppError, wrapUnknownError, ErrorResponseBody } from './app-errors';

export function sendError(res: Response, error: unknown, fallbackMessage?: string): void {
  const appError = isAppError(error) ? error : wrapUnknownError(error);

  console.error(`[${appError.category}] ${appError.errorCode}: ${appError.technicalMessage}`,
    appError.cause instanceof Error ? appError.cause.stack : '');

  res.status(appError.statusCode).json(appError.toResponse());
}

export function sendValidationError(res: Response, message: string, opts?: { details?: string[]; action?: string }): void {
  const body: ErrorResponseBody = {
    success: false,
    errorCode: 'VALIDATION_ERROR',
    message,
    details: opts?.details,
    action: opts?.action ?? 'Please check the highlighted fields and try again.',
  };
  res.status(400).json(body);
}

export function sendNotFound(res: Response, entity: string, identifier?: string | number): void {
  const idPart = identifier !== undefined ? ` (${identifier})` : '';
  const body: ErrorResponseBody = {
    success: false,
    errorCode: 'NOT_FOUND',
    message: `${entity}${idPart} was not found.`,
    action: `Verify the ${entity.toLowerCase()} exists and try again.`,
  };
  res.status(404).json(body);
}

export function sendPermissionError(res: Response, message?: string): void {
  const body: ErrorResponseBody = {
    success: false,
    errorCode: 'PERMISSION_DENIED',
    message: message ?? 'You do not have permission to perform this action.',
    action: 'Contact your administrator if you believe this is an error.',
  };
  res.status(403).json(body);
}

export function sendBusinessError(res: Response, message: string, opts?: { action?: string; details?: string[] }): void {
  const body: ErrorResponseBody = {
    success: false,
    errorCode: 'BUSINESS_RULE_VIOLATION',
    message,
    details: opts?.details,
    action: opts?.action,
  };
  res.status(422).json(body);
}
