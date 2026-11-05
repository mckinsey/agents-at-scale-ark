import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { arkServicesService } from '@/lib/services/ark-services';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('arkServicesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every Helm release in the given namespace', async () => {
    const items = [{ name: 'ark-api' }];
    const errors = [
      { name: 'broken', message: 'The release data has an unexpected format.' },
    ];
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items, count: 1, errors });

    const result = await arkServicesService.getAll('test-namespace');

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/ark-services/helm-releases',
      { params: { namespace: 'test-namespace' } },
    );
    expect(result).toEqual({ items, errors });
  });
});
