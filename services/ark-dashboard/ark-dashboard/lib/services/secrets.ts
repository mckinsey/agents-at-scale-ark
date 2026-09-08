import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

export type Secret = components['schemas']['SecretResponse'];
export type SecretListResponse = components['schemas']['SecretListResponse'];
export type SecretCreateRequest = components['schemas']['SecretCreateRequest'];
export type SecretUpdateRequest = components['schemas']['SecretUpdateRequest'];
export type SecretDetailResponse =
  components['schemas']['SecretDetailResponse'];

export const secretsService = {
  async getAll(namespace: string): Promise<Secret[]> {
    const response = await apiClient.get<SecretListResponse>(
      `/api/v1/secrets`,
      { params: { namespace } },
    );
    return response.items;
  },

  async get(namespace: string, name: string): Promise<SecretDetailResponse> {
    return apiClient.get<SecretDetailResponse>(`/api/v1/secrets/${name}`, {
      params: { namespace },
    });
  },

  async create(
    namespace: string,
    request: SecretCreateRequest,
  ): Promise<SecretDetailResponse> {
    const response = await apiClient.post<SecretDetailResponse>(
      `/api/v1/secrets`,
      request,
      { params: { namespace } },
    );
    trackEvent({
      name: 'secret_created',
      properties: { secretName: request.name },
    });
    return response;
  },

  /**
   * Replaces a secret's metadata (and value when `string_data` is set). This is
   * a full replace, not a partial update: omitting `description` or `alias`
   * clears them, so callers must send the complete desired state on every call.
   */
  async update(
    namespace: string,
    name: string,
    request: SecretUpdateRequest,
  ): Promise<SecretDetailResponse> {
    const response = await apiClient.put<SecretDetailResponse>(
      `/api/v1/secrets/${name}`,
      request,
      { params: { namespace } },
    );
    trackEvent({
      name: 'secret_updated',
      properties: { secretName: name },
    });
    return response;
  },

  async delete(namespace: string, name: string): Promise<void> {
    await apiClient.delete(`/api/v1/secrets/${name}`, {
      params: { namespace },
    });
    trackEvent({
      name: 'secret_deleted',
      properties: { secretName: name },
    });
  },
};
