import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';

import { secretsService } from './secrets';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn() },
}));

const mockGet = vi.mocked(apiClient.get);

describe('secretsService.get', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('fetches a single secret by name and returns its key names', async () => {
    mockGet.mockResolvedValue({
      metadata: { name: 'aws-credentials', uid: 'abc' },
      type: 'Opaque',
      data: {
        accessKeyId: btoa('an-access-key-id'),
        secretAccessKey: btoa('a-secret-access-key'),
      },
    });

    const secret = await secretsService.get('aws-credentials');

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/resources/api/v1/Secret/aws-credentials',
    );
    expect(secret.keys).toEqual(['accessKeyId', 'secretAccessKey']);
  });
});
