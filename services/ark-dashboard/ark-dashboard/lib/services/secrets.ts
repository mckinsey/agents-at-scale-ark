import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

// Use the generated type from OpenAPI
export type Secret = components['schemas']['SecretResponse'];
export type SecretListResponse = components['schemas']['SecretListResponse'];
export type SecretCreateRequest = components['schemas']['SecretCreateRequest'];
export type SecretUpdateRequest = components['schemas']['SecretUpdateRequest'];
export type SecretDetailResponse =
  components['schemas']['SecretDetailResponse'];

// Service with list operation
export const secretsService = {
  // Get all secrets for a given namespace
  async getAll(): Promise<Secret[]> {
    const response = await apiClient.get<SecretListResponse>(`/api/v1/secrets`);
    return response.items;
  },

  // Create a new secret
  async create(name: string, password: string): Promise<SecretDetailResponse> {
    const request: SecretCreateRequest = {
      name,
      string_data: {
        token: password,
      },
      type: 'Opaque',
    };
    const response = await apiClient.post<SecretDetailResponse>(
      `/api/v1/secrets`,
      request,
    );
    trackEvent({
      name: 'secret_created',
      properties: { secretName: name },
    });
    return response;
  },

  // Update an existing secret
  async update(name: string, password: string): Promise<SecretDetailResponse> {
    const request: SecretUpdateRequest = {
      string_data: {
        token: password,
      },
    };
    const response = await apiClient.put<SecretDetailResponse>(
      `/api/v1/secrets/${name}`,
      request,
    );
    trackEvent({
      name: 'secret_updated',
      properties: { secretName: name },
    });
    return response;
  },

  // Delete a secret
  async delete(name: string): Promise<void> {
    await apiClient.delete(`/api/v1/secrets/${name}`);
    trackEvent({
      name: 'secret_deleted',
      properties: { secretName: name },
    });
  },
};
