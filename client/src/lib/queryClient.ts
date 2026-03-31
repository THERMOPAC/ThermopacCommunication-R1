import { QueryClient, QueryFunction } from "@tanstack/react-query";

export interface ApiErrorResponse {
  success: false;
  errorCode: string;
  message: string;
  details?: string[];
  action?: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly userMessage: string;
  public readonly details: string[];
  public readonly action: string | undefined;

  constructor(statusCode: number, body: ApiErrorResponse) {
    super(body.message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = body.errorCode;
    this.userMessage = body.message;
    this.details = body.details ?? [];
    this.action = body.action;
  }

  get displayMessage(): string {
    const parts: string[] = [this.userMessage];
    if (this.details.length) {
      parts.push(this.details.join('. '));
    }
    if (this.action) {
      parts.push(this.action);
    }
    return parts.join(' ');
  }
}

function isStructuredError(obj: any): obj is ApiErrorResponse {
  return obj && obj.success === false && typeof obj.errorCode === 'string' && typeof obj.message === 'string';
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let body: string | null = null;
    try {
      body = await res.text();
    } catch {}

    if (body) {
      try {
        const parsed = JSON.parse(body);
        if (isStructuredError(parsed)) {
          throw new ApiError(res.status, parsed);
        }
        if (parsed.error) {
          throw new ApiError(res.status, {
            success: false,
            errorCode: parsed.code || 'UNKNOWN_ERROR',
            message: typeof parsed.error === 'string' ? parsed.error : (parsed.message || res.statusText),
            details: parsed.details ? (Array.isArray(parsed.details) ? parsed.details : [String(parsed.details)]) : undefined,
          });
        }
        if (parsed.message) {
          throw new ApiError(res.status, {
            success: false,
            errorCode: 'UNKNOWN_ERROR',
            message: parsed.message,
          });
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }

    throw new Error(`${res.status}: ${body || res.statusText}`);
  }
}

export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
  skipErrorThrow: boolean = false,
  parseJson: boolean = true
): Promise<T | Response> {
  const isFormData = data instanceof FormData;

  let sanitizedData = data;
  if (data && !isFormData && typeof data === 'object') {
    sanitizedData = JSON.parse(JSON.stringify(data));
  }

  try {
    const res = await fetch(url, {
      method,
      headers: data && !isFormData ? {
        "Content-Type": "application/json",
        "Accept": "application/json"
      } : {},
      body: isFormData ? data : sanitizedData ? JSON.stringify(sanitizedData) : undefined,
      credentials: "include",
    });

    if (!skipErrorThrow) {
      await throwIfResNotOk(res);
    }

    if (parseJson) {
      try {
        const text = await res.text();

        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          console.error('Received HTML instead of JSON:', text.substring(0, 150) + '...');
          throw new Error('Server returned HTML instead of JSON. This may indicate a server error.');
        }

        return text ? JSON.parse(text) : null;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        console.error('Error parsing response:', error);
        if (error instanceof Error) {
          throw new Error(`Failed to parse server response as JSON: ${error.message}`);
        } else {
          throw new Error('Failed to parse server response as JSON');
        }
      }
    } else {
      return res;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('API request failed:', error);
    throw error;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    const msg = error.message;
    const colonIdx = msg.indexOf(': ');
    if (colonIdx > 0 && colonIdx < 5) {
      const afterStatus = msg.substring(colonIdx + 2);
      try {
        const parsed = JSON.parse(afterStatus);
        if (isStructuredError(parsed)) return parsed.message;
        if (parsed.message) return parsed.message;
        if (parsed.error) return typeof parsed.error === 'string' ? parsed.error : msg;
      } catch {}
      return afterStatus;
    }
    return msg;
  }
  return 'An unexpected error occurred.';
}

export function getErrorDetails(error: unknown): string[] {
  if (error instanceof ApiError) return error.details;
  return [];
}

export function getErrorAction(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.action;
  return undefined;
}

export async function fetchWithProjectAccess(url: string): Promise<any> {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.code === "PROJECT_ACCESS_DENIED") {
      throw new ApiError(403, {
        success: false,
        errorCode: "PROJECT_ACCESS_DENIED",
        message: "You do not have access to this project. Contact your administrator to request membership.",
      });
    }
    if (body.code === "PAGE_ACCESS_DENIED") {
      throw new ApiError(403, {
        success: false,
        errorCode: "PAGE_ACCESS_DENIED",
        message: "You do not have permission to access this page.",
      });
    }
    if (body.code === "RECORD_ACCESS_DENIED") {
      throw new ApiError(403, {
        success: false,
        errorCode: "RECORD_ACCESS_DENIED",
        message: "You do not have permission to view this record.",
      });
    }
  }
  await throwIfResNotOk(res);
  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);

    try {
      const text = await res.text();

      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        console.error('Received HTML instead of JSON:', text.substring(0, 150) + '...');
        throw new Error('Server returned HTML instead of JSON. This may indicate a server error.');
      }

      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error('Error parsing response:', error);
      if (error instanceof Error && error.message.includes('Server returned HTML')) {
        throw error;
      }
      return null;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});
