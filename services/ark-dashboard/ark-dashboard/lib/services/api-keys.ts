/**
 * API Key management service for ARK Dashboard
 */

import { apiClient } from '../api/client';

// API Key interfaces matching backend models
export interface APIKey {
  id: string;
  name: string;
  public_key: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export interface APIKeyCreateRequest {
  name: string;
  expires_at?: string | null;
}

export interface APIKeyCreateResponse extends APIKey {
  secret_key: string; // Only shown once during creation
}

export interface APIKeyListResponse {
  items: APIKey[];
  count: number;
}

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
  }
};
