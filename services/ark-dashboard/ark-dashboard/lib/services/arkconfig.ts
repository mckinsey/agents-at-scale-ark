import { apiClient } from '../api/client';
import type { components } from '../api/generated/types';

export type ArkConfigResponse = components['schemas']['ArkConfigResponse'];
export type ArkConfigUpdateRequest =
  components['schemas']['ArkConfigUpdateRequest'];

export const arkConfigService = {
  async get(): Promise<ArkConfigResponse> {
    return apiClient.get<ArkConfigResponse>('/api/v1/arkconfig');
  },

  async update(request: ArkConfigUpdateRequest): Promise<ArkConfigResponse> {
    return apiClient.put<ArkConfigResponse>('/api/v1/arkconfig', request);
  },

  async clear(): Promise<void> {
    return apiClient.delete('/api/v1/arkconfig');
  },
};
