import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toolsService } from '@/lib/services/tools';
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

describe('toolsService namespace support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create passes namespace as query parameter', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(undefined);
    await toolsService.create({
      name: 'test-tool',
      type: 'http',
      description: 'A tool',
      namespace: 'ns1',
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/tools',
      expect.any(Object),
      { params: { namespace: 'ns1' } },
    );
  });

  it('create does not hardcode default namespace in payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(undefined);
    await toolsService.create({
      name: 'test-tool',
      type: 'http',
      description: 'A tool',
    });
    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.namespace).toBeUndefined();
  });

  it('delete passes namespace', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);
    await toolsService.delete('test-tool', { namespace: 'ns1' });
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/v1/tools/test-tool',
      { params: { namespace: 'ns1' } },
    );
  });
});
