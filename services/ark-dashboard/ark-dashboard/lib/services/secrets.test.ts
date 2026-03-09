import { describe, it, expect, beforeEach, vi } from 'vitest';
import { secretsService } from '@/lib/services/secrets';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  withNamespace: vi.fn((ns?: string) =>
    ns ? { params: { namespace: ns } } : undefined,
  ),
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

const mockSecret = { name: 'test-secret' };

describe('secretsService namespace support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create passes namespace', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockSecret);
    await secretsService.create('test-secret', 'password123', {
      namespace: 'ns1',
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/secrets',
      expect.any(Object),
      { params: { namespace: 'ns1' } },
    );
  });

  it('update passes namespace', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce(mockSecret);
    await secretsService.update('test-secret', 'newpass', {
      namespace: 'ns1',
    });
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/secrets/test-secret',
      expect.any(Object),
      { params: { namespace: 'ns1' } },
    );
  });

  it('delete passes namespace', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);
    await secretsService.delete('test-secret', { namespace: 'ns1' });
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/v1/secrets/test-secret',
      { params: { namespace: 'ns1' } },
    );
  });
});
