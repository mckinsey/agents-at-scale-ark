/**
 * API Key management service for ARK Dashboard
 */
import { apiClient } from '../api/client';
import type { components } from '../api/generated/types';

// Use generated types from OpenAPI
export type APIKey = components['schemas']['APIKeyResponse'];
export type APIKeyCreateRequest = components['schemas']['APIKeyCreateRequest'];
export type APIKeyCreateResponse =
  components['schemas']['APIKeyCreateResponse'];
export type APIKeyListResponse = components['schemas']['APIKeyListResponse'];

// API Key service following ARK Dashboard patterns
export const apiKeysService = {
  /**
   * Get all API keys
   */
  async getAll(): Promise<APIKeyListResponse> {
    return apiClient.get<APIKeyListResponse>('/api/v1/api-keys');
  },

  /**
   * Create a new API key
   */
  async create(request: APIKeyCreateRequest): Promise<APIKeyCreateResponse> {
    return apiClient.post<APIKeyCreateResponse>('/api/v1/api-keys', request);
  },

  /**
   * Delete (revoke) an API key by public key
   */
  async delete(publicKey: string): Promise<void> {
    return apiClient.delete(`/api/v1/api-keys/${publicKey}`);
  },
};
