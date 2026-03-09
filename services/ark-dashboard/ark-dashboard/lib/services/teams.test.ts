import { describe, it, expect, beforeEach, vi } from 'vitest';
import { teamsService } from '@/lib/services/teams';
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

const mockTeamDetail = { name: 'test-team', strategy: 'round-robin' };

describe('teamsService namespace support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create passes namespace', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockTeamDetail);
    await teamsService.create(
      { name: 'test-team', strategy: 'round-robin' },
      { namespace: 'ns1' },
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/teams',
      { name: 'test-team', strategy: 'round-robin' },
      { params: { namespace: 'ns1' } },
    );
  });

  it('update passes namespace', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce(mockTeamDetail);
    await teamsService.update('test-team', { strategy: 'parallel' }, {
      namespace: 'ns1',
    });
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/teams/test-team',
      { strategy: 'parallel' },
      { params: { namespace: 'ns1' } },
    );
  });

  it('delete passes namespace', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);
    await teamsService.delete('test-team', { namespace: 'ns1' });
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/v1/teams/test-team',
      { params: { namespace: 'ns1' } },
    );
  });

  it('getById passes namespace', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockTeamDetail);
    await teamsService.getById('test-team', { namespace: 'ns1' });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/teams/test-team',
      { params: { namespace: 'ns1' } },
    );
  });

  it('updateById passes namespace', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce(mockTeamDetail);
    await teamsService.updateById('test-team', { strategy: 'parallel' }, {
      namespace: 'ns1',
    });
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/teams/test-team',
      { strategy: 'parallel' },
      { params: { namespace: 'ns1' } },
    );
  });

  it('deleteById passes namespace', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);
    await teamsService.deleteById('test-team', { namespace: 'ns1' });
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/v1/teams/test-team',
      { params: { namespace: 'ns1' } },
    );
  });
});
