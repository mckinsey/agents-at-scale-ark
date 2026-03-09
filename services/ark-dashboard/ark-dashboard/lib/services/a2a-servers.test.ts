import { describe, it, expect, beforeEach, vi } from 'vitest';
import { A2AServersService } from '@/lib/services/a2a-servers';
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

const mockA2AServer = { name: 'test-a2a', id: 'test-a2a', namespace: 'ns1' };

describe('A2AServersService namespace support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create passes namespace', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockA2AServer);
    await A2AServersService.create(
      { name: 'test-a2a', namespace: 'ns1', spec: {} } as never,
      { namespace: 'ns1' },
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/a2a-servers',
      { name: 'test-a2a', namespace: 'ns1', spec: {} },
      { params: { namespace: 'ns1' } },
    );
  });

  it('update passes namespace', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce(mockA2AServer);
    await A2AServersService.update('test-a2a', { spec: {} } as never, {
      namespace: 'ns1',
    });
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/a2a-servers/test-a2a',
      { spec: {} },
      { params: { namespace: 'ns1' } },
    );
  });

  it('delete passes namespace', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);
    await A2AServersService.delete('test-a2a', { namespace: 'ns1' });
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/v1/a2a-servers/test-a2a',
      { params: { namespace: 'ns1' } },
    );
  });
});
