import { trackError } from '@/lib/analytics/singleton';

import { API_CONFIG } from './config';

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

class APIClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;

  constructor(baseURL: string, defaultHeaders: HeadersInit = {}) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { params, headers, ...requestOptions } = options;

    let url = `${this.baseURL}${endpoint}`;

    // Add query parameters if provided
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
    }

    // Add cache buster for GET requests
    if (!options.method || options.method === 'GET') {
      searchParams.append('_t', Date.now().toString());
    }

    if (searchParams.toString()) {
      url += `?${searchParams.toString()}`;
    }

    try {
      const response = await fetch(url, {
        ...requestOptions,
        cache: 'no-store',
        headers: {
          ...this.defaultHeaders,
          ...headers,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      const isJSON = contentType?.includes('application/json');

      if (!response.ok) {
        const errorData = isJSON
          ? await response.json()
          : await response.text();

        let errorMessage = `HTTP error! status: ${response.status}`;
        if (typeof errorData === 'object' && errorData !== null) {
          // Check for common error message fields
          if ('detail' in errorData && errorData.detail) {
            errorMessage = String(errorData.detail);
          } else if ('message' in errorData && errorData.message) {
            errorMessage = String(errorData.message);
          } else if ('reason' in errorData && errorData.reason) {
            errorMessage = String(errorData.reason);
          }
        } else if (typeof errorData === 'string' && errorData) {
          errorMessage = errorData;
        }

        const apiError = new APIError(errorMessage, response.status, errorData);

        trackError({
          message: apiError.message,
          severity: 'error',
          context: {
            type: 'api_error',
            endpoint,
            method: requestOptions.method || 'GET',
            status: response.status,
          },
        });

        throw apiError;
      }

      // Handle 204 No Content responses
      if (response.status === 204) {
        return undefined as T;
      }

      // Return parsed JSON or text based on content type
      if (isJSON) {
        const data = await response.json();

        // Check if the response is a Kubernetes Status object indicating an error
        if (
          data &&
          typeof data === 'object' &&
          'kind' in data &&
          data.kind === 'Status' &&
          'status' in data &&
          data.status === 'Failure'
        ) {
          const errorMessage =
            'message' in data && data.message
              ? String(data.message)
              : 'API request failed';
          const statusCode =
            'code' in data && typeof data.code === 'number'
              ? data.code
              : response.status;

          const apiError = new APIError(errorMessage, statusCode, data);

          trackError({
            message: apiError.message,
            severity: 'error',
            context: {
              type: 'api_error',
              endpoint,
              method: requestOptions.method || 'GET',
              status: statusCode,
            },
          });

          throw apiError;
        }

        return data as T;
      } else {
        return (await response.text()) as T;
      }
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'An unknown error occurred';

      trackError({
        message,
        stack: error instanceof Error ? error.stack : undefined,
        severity: 'error',
        context: {
          type: 'network_error',
          endpoint,
          method: requestOptions.method || 'GET',
        },
      });

      throw new APIError(message);
    }
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// Create and export a singleton instance
export const apiClient = new APIClient(
  API_CONFIG.baseURL,
  API_CONFIG.defaultHeaders,
);

// Export the class for cases where multiple instances might be needed
export { APIClient };
