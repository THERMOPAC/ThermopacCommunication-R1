import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Enhanced API request function that automatically parses JSON
 * @param method - HTTP method (GET, POST, PUT, etc.)
 * @param url - API endpoint URL
 * @param data - Optional data to send with the request
 * @param skipErrorThrow - Whether to skip throwing errors
 * @param parseJson - Whether to parse and return JSON (default: true)
 * @returns Parsed JSON data or Response object based on parseJson parameter
 */
export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
  skipErrorThrow: boolean = false,
  parseJson: boolean = true
): Promise<T | Response> {
  // For FormData, don't set Content-Type header (browser will set it with boundary)
  // and don't stringify the data
  const isFormData = data instanceof FormData;
  
  const res = await fetch(url, {
    method,
    headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
    body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!skipErrorThrow) {
    await throwIfResNotOk(res);
  }
  
  // Return parsed JSON data if requested, otherwise return Response object
  return parseJson ? await res.json() : res;
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
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
