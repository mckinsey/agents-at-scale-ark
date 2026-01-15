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
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
      url += `?${searchParams.toString()}`;
    }

    try {
      const response = await fetch(url, {
        ...requestOptions,
        headers: {
          ...this.defaultHeaders,
          ...headers,
        },
      });

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      const isJSON = contentType?.includes('application/json');

      if (!response.ok) {
        const errorData = isJSON
          ? await response.json()
          : await response.text();
        const apiError = new APIError(
          errorData.message || `HTTP error! status: ${response.status}`,
          response.status,
          errorData,
        );

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
        return (await response.json()) as T;
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
