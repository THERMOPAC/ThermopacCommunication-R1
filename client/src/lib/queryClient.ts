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
  
  // Sanitize data to ensure it's valid JSON
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
    
    // Return parsed JSON data if requested, otherwise return Response object
    if (parseJson) {
      try {
        // Some endpoints might return empty response
        const text = await res.text();
        
        // Additional check - if the response starts with <!DOCTYPE or <html, it's an HTML error page
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          console.error('Received HTML instead of JSON:', text.substring(0, 150) + '...');
          throw new Error('Server returned HTML instead of JSON. This may indicate a server error.');
        }
        
        return text ? JSON.parse(text) : null;
      } catch (error) {
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
    console.error('API request failed:', error);
    throw error;
  }
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
      // Some endpoints might return empty response
      const text = await res.text();
      
      // Additional check - if the response starts with <!DOCTYPE or <html, it's an HTML error page
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        console.error('Received HTML instead of JSON:', text.substring(0, 150) + '...');
        throw new Error('Server returned HTML instead of JSON. This may indicate a server error.');
      }
      
      return text ? JSON.parse(text) : null;
    } catch (error) {
      console.error('Error parsing response:', error);
      if (error instanceof Error && error.message.includes('Server returned HTML')) {
        throw error; // Re-throw the HTML error
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
      staleTime: 0, // Changed from Infinity to 0 to avoid stale data
      retry: 1,     // Allow one retry
    },
    mutations: {
      retry: false,
    },
  },
});
