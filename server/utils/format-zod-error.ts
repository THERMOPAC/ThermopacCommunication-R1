import { ZodError } from 'zod';

/**
 * Formats a ZodError into a more user-friendly structure
 * 
 * @param error The ZodError instance
 * @returns An object with field names as keys and error messages as values
 */
export function formatZodError(error: ZodError) {
  const formattedErrors: Record<string, string> = {};
  
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    formattedErrors[path || 'general'] = err.message;
  });
  
  return formattedErrors;
}