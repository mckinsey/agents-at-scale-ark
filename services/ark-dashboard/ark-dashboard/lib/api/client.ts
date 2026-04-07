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
  private defaultParams: Record<string, string> = {};

  constructor(baseURL: string, defaultHeaders: HeadersInit = {}) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
    };
  }

  setDefaultParam(key: string, value: string | undefined) {
    if (value === undefined) {
      delete this.defaultParams[key];
    } else {
      this.defaultParams[key] = value;
    }
  }

  private buildRequestUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    method?: string,
  ): string {
    const isAbsolute = this.baseURL.startsWith('http') || this.baseURL.startsWith('//');
    const base = isAbsolute || typeof globalThis.location === 'undefined'
      ? this.baseURL
      : `${globalThis.location.origin}${this.baseURL}`;
    const url = new URL(endpoint, base);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    if (!method || method === 'GET') {
      url.searchParams.append('_t', Date.now().toString());
    }

    return url.toString();
  }

  private extractErrorMessage(errorData: unknown): string {
    if (typeof errorData === 'object' && errorData !== null) {
      if ('detail' in errorData && errorData.detail) {
        return String(errorData.detail);
      }
      if ('message' in errorData && errorData.message) {
        return String(errorData.message);
      }
      if ('reason' in errorData && errorData.reason) {
        return String(errorData.reason);
      }
    }
    if (typeof errorData === 'string' && errorData) {
      return errorData;
    }
    return 'API request failed';
  }

  private async handleErrorResponse(
    response: Response,
    isJSON: boolean,
    endpoint: string,
    method: string,
  ): Promise<never> {
    const errorData = isJSON
      ? await response.json()
      : await response.text();

    const errorMessage = this.extractErrorMessage(errorData) ||
      `HTTP error! status: ${response.status}`;

    const apiError = new APIError(errorMessage, response.status, errorData);

    trackError({
      message: apiError.message,
      severity: 'error',
      context: {
        type: 'api_error',
        endpoint,
        method,
        status: response.status,
      },
    });

    throw apiError;
  }

  private handleKubernetesStatusError(
    data: unknown,
    response: Response,
    endpoint: string,
    method: string,
  ): void {
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
          method,
          status: statusCode,
        },
      });

      throw apiError;
    }
  }

  private async handleSuccessResponse<T>(
    response: Response,
    isJSON: boolean,
    endpoint: string,
    method: string,
  ): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }

    if (isJSON) {
      const data = await response.json();
      this.handleKubernetesStatusError(data, response, endpoint, method);
      return data as T;
    }

    return (await response.text()) as T;
  }

  private handleNetworkError(
    error: unknown,
    endpoint: string,
    method: string,
  ): never {
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
        method,
      },
    });

    throw new APIError(message);
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { params, headers, ...requestOptions } = options;
    const method = requestOptions.method || 'GET';
    const mergedParams = { ...this.defaultParams, ...params };

    const url = this.buildRequestUrl(endpoint, mergedParams, method);

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

      const contentType = response.headers.get('content-type');
      const isJSON = contentType?.includes('application/json') ?? false;

      if (!response.ok) {
        return await this.handleErrorResponse(response, isJSON, endpoint, method);
      }

      return await this.handleSuccessResponse<T>(response, isJSON, endpoint, method);
    } catch (error) {
      return this.handleNetworkError(error, endpoint, method);
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
