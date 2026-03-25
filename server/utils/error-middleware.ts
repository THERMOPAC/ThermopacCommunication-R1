import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError, wrapUnknownError, isAppError } from './app-errors';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let appError: AppError;

  if (isAppError(err)) {
    appError = err;
  } else if (err instanceof ZodError) {
    const fieldErrors = err.errors.map(e => {
      const path = e.path.join('.');
      return path ? `${path}: ${e.message}` : e.message;
    });
    appError = new ValidationError('Please correct the following fields.', {
      details: fieldErrors,
      action: 'Fix the highlighted errors and submit again.',
    });
  } else {
    appError = wrapUnknownError(err);
  }

  console.error(`[${appError.category}] ${appError.errorCode}: ${appError.technicalMessage}`, {
    url: req.originalUrl,
    method: req.method,
    userId: (req as any).user?.id,
    cause: appError.cause instanceof Error ? appError.cause.stack : undefined,
  });

  if (req.path.startsWith('/api')) {
    res.setHeader('Content-Type', 'application/json');
    res.status(appError.statusCode).json(appError.toResponse());
  } else {
    res.status(appError.statusCode).json({ message: appError.userMessage });
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
