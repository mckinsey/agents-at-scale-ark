import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

export type HelmRelease = components['schemas']['HelmRelease'];
export type HelmReleaseError = components['schemas']['HelmReleaseError'];
type HelmReleaseListResponse = components['schemas']['HelmReleaseListResponse'];

export interface HelmReleaseList {
  items: HelmRelease[];
  errors: HelmReleaseError[];
}

export const arkServicesService = {
  async getAll(namespace: string): Promise<HelmReleaseList> {
    const response = await apiClient.get<HelmReleaseListResponse>(
      '/api/v1/ark-services/helm-releases',
      { params: { namespace } },
    );
    return { items: response.items, errors: response.errors };
  },
};
