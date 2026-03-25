import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";
import { ValidationError } from "./app-errors";

export const validateSchema = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = error.errors.map(e => {
          const path = e.path.join('.');
          return path ? `${path}: ${e.message}` : e.message;
        });
        const appError = new ValidationError('Please correct the following fields.', {
          details: fieldErrors,
          action: 'Fix the highlighted errors and submit again.',
        });
        console.error("Validation error:", error.errors);
        return res.status(appError.statusCode).json(appError.toResponse());
      }
      next(error);
    }
  };
};
