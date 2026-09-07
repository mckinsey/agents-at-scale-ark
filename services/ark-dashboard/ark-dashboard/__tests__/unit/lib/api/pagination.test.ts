import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchAllPages } from '@/lib/api/pagination';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('fetchAllPages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns items from a single page when there is no continue token', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [{ name: 'a' }, { name: 'b' }],
      continue_token: null,
    });

    const result = await fetchAllPages<{ name: string }>('/api/v1/agents');

    expect(result).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/agents', {
      params: { limit: 100 },
    });
  });

  it('follows continue tokens across pages and concatenates items', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ items: [{ name: 'a' }], continue_token: 't1' })
      .mockResolvedValueOnce({ items: [{ name: 'b' }], continue_token: 't2' })
      .mockResolvedValueOnce({ items: [{ name: 'c' }], continue_token: null });

    const result = await fetchAllPages<{ name: string }>('/api/v1/agents');

    expect(result).toEqual([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    expect(apiClient.get).toHaveBeenCalledTimes(3);
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/v1/agents', {
      params: { limit: 100, continue: 't1' },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/api/v1/agents', {
      params: { limit: 100, continue: 't2' },
    });
  });

  it('stops when continue token is absent from the response', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [{ name: 'a' }] });

    const result = await fetchAllPages<{ name: string }>('/api/v1/agents');

    expect(result).toEqual([{ name: 'a' }]);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('merges caller-provided params with pagination params', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      continue_token: null,
    });

    await fetchAllPages('/api/v1/agents', { namespace: 'demo' });

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/agents', {
      params: { namespace: 'demo', limit: 100 },
    });
  });
});
