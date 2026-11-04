import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

export type HelmRelease = components['schemas']['HelmRelease'];
type HelmReleaseListResponse = components['schemas']['HelmReleaseListResponse'];

export const arkServicesService = {
  async getAll(namespace: string): Promise<HelmRelease[]> {
    const response = await apiClient.get<HelmReleaseListResponse>(
      '/api/v1/ark-services/marketplace-items',
      { params: { namespace } },
    );
    return response.items;
  },
};
