import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

export type Configuration = components['schemas']['ConfigurationResponse'];
export type ConfigurationListResponse =
  components['schemas']['ConfigurationListResponse'];
export type ConfigurationCreateRequest =
  components['schemas']['ConfigurationCreateRequest'];
export type ConfigurationUpdateRequest =
  components['schemas']['ConfigurationUpdateRequest'];
export type ConfigurationReference =
  components['schemas']['ConfigurationReference'];
export type ConfigurationReferenceListResponse =
  components['schemas']['ConfigurationReferenceListResponse'];

export const configurationsService = {
  async getAll(): Promise<Configuration[]> {
    const response = await apiClient.get<ConfigurationListResponse>(
      `/api/v1/configurations`,
    );
    return response.items;
  },

  async get(name: string): Promise<Configuration> {
    return apiClient.get<Configuration>(`/api/v1/configurations/${name}`);
  },

  async create(request: ConfigurationCreateRequest): Promise<Configuration> {
    const response = await apiClient.post<Configuration>(
      `/api/v1/configurations`,
      request,
    );
    trackEvent({
      name: 'configuration_created',
      properties: { configurationName: request.name },
    });
    return response;
  },

  /**
   * Replaces a configuration. This is a full replace, not a partial update:
   * omitting `description` or `alias` clears them on the stored configuration,
   * so callers must send the complete desired state on every call.
   */
  async update(
    name: string,
    request: ConfigurationUpdateRequest,
  ): Promise<Configuration> {
    const response = await apiClient.put<Configuration>(
      `/api/v1/configurations/${name}`,
      request,
    );
    trackEvent({
      name: 'configuration_updated',
      properties: { configurationName: name },
    });
    return response;
  },

  async delete(name: string): Promise<void> {
    await apiClient.delete(`/api/v1/configurations/${name}`);
    trackEvent({
      name: 'configuration_deleted',
      properties: { configurationName: name },
    });
  },

  async getReferences(name: string): Promise<ConfigurationReference[]> {
    const response = await apiClient.get<ConfigurationReferenceListResponse>(
      `/api/v1/configurations/${name}/references`,
    );
    return response.items;
  },
};
