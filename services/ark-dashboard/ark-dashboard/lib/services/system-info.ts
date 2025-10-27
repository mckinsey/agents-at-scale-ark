import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

export type SystemInfo = components['schemas']['SystemInfo'];

export const systemInfoService = {
  async get(): Promise<SystemInfo> {
    return await apiClient.get<SystemInfo>('/api/v1/system-info');
  },
};
