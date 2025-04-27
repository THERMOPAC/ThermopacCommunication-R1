import { Request, Response, NextFunction } from "express";
import { AnyZodObject } from "zod";

/**
 * Middleware to validate request body against a Zod schema
 * @param schema The Zod schema to validate against
 */
export const validateSchema = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      console.error("Validation error:", error);
      return res.status(400).json({
        error: "Validation failed",
        details: error
      });
    }
  };
};