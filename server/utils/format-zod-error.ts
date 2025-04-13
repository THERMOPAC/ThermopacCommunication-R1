import { ZodError } from 'zod';

// Format Zod validation errors into a more user-friendly object
export function formatZodError(error: ZodError) {
  return error.errors.reduce((acc, curr) => {
    const path = curr.path.join('.');
    acc[path] = curr.message;
    return acc;
  }, {} as Record<string, string>);
}