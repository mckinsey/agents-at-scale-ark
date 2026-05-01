import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { queriesService } from '@/lib/services/queries';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

describe('queriesService.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls /api/v1/queries with no query string when no params given', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      count: 0,
      total: 0,
      page: 1,
      page_size: 25,
    });

    await queriesService.list();

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/queries');
  });

  it('includes page and page_size in the query string', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      count: 0,
      total: 0,
      page: 3,
      page_size: 50,
    });

    await queriesService.list({ page: 3, pageSize: 50 });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/queries?page=3&page_size=50',
    );
  });

  it('includes search in the query string when provided', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      count: 0,
      total: 0,
      page: 1,
      page_size: 25,
    });

    await queriesService.list({ search: 'hello' });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/queries?search=hello',
    );
  });

  it('omits search when empty string', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      count: 0,
      total: 0,
      page: 1,
      page_size: 25,
    });

    await queriesService.list({ page: 2, search: '' });

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/queries?page=2');
  });

  it('combines all three params correctly', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      count: 0,
      total: 0,
      page: 1,
      page_size: 25,
    });

    await queriesService.list({ page: 2, pageSize: 15, search: 'foo bar' });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/queries?page=2&page_size=15&search=foo+bar',
    );
  });

  it('returns the response from the API client', async () => {
    const mockResponse = {
      items: [{ name: 'q-1', namespace: 'default', input: 'hi' }],
      count: 1,
      total: 100,
      page: 2,
      page_size: 10,
    };
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

    const result = await queriesService.list({ page: 2, pageSize: 10 });

    expect(result).toEqual(mockResponse);
  });

  it('treats pageSize=0 as an explicit value (not omitted)', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      count: 0,
      total: 0,
      page: 1,
      page_size: 25,
    });

    await queriesService.list({ pageSize: 0 });

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/queries?page_size=0');
  });
});

describe('queriesService.get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls /api/v1/queries/:name', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      name: 'q-1',
      namespace: 'default',
      input: 'hi',
    });

    await queriesService.get('q-1');

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/queries/q-1');
  });
});

describe('queriesService.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls DELETE /api/v1/queries/:name', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    await queriesService.delete('q-1');

    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/queries/q-1');
  });
});

describe('queriesService.cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls PATCH /api/v1/queries/:name/cancel', async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      name: 'q-1',
      namespace: 'default',
      input: 'hi',
    });

    await queriesService.cancel('q-1');

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/api/v1/queries/q-1/cancel',
    );
  });
});
