import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getArkApiAuthHeaders } from '@/lib/auth/server-auth-headers';
import {
  getMarketplaceItemById,
  getRawMarketplaceItemById,
} from '@/lib/services/marketplace-server';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('@/lib/api/server-client', () => ({
  serverApiClient: { get: mockGet },
}));

vi.mock('@/lib/auth/server-auth-headers', () => ({
  getArkApiAuthHeaders: vi.fn(),
}));

function createRequest() {
  return new NextRequest(
    new URL('http://localhost/api/marketplace/phoenix?namespace=team-a'),
  );
}

const group = {
  source: 'github',
  items: [{ name: 'Phoenix', description: 'Observability platform' }],
};

describe('marketplace-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue([group]);
  });

  it('forwards the minted Authorization header to serverApiClient', async () => {
    vi.mocked(getArkApiAuthHeaders).mockResolvedValueOnce({
      Authorization: 'Bearer test-token',
    });

    const request = createRequest();
    await getRawMarketplaceItemById(request, 'phoenix', 'team-a');

    expect(getArkApiAuthHeaders).toHaveBeenCalledWith(request);
    expect(mockGet).toHaveBeenCalledWith(
      '/v1/namespaces/team-a/marketplace-items',
      { headers: { Authorization: 'Bearer test-token' } },
    );
  });

  it('calls serverApiClient without a header when no session token is minted', async () => {
    vi.mocked(getArkApiAuthHeaders).mockResolvedValueOnce({});

    await getMarketplaceItemById(createRequest(), 'phoenix', 'team-a');

    expect(mockGet).toHaveBeenCalledWith(
      '/v1/namespaces/team-a/marketplace-items',
      { headers: {} },
    );
  });

  it('returns the source key separately from its display label', async () => {
    vi.mocked(getArkApiAuthHeaders).mockResolvedValueOnce({});
    mockGet.mockResolvedValueOnce([
      {
        ...group,
        source: 'internal-mirror',
        displayName: 'Internal Mirror',
        url: 'https://internal.example.com/marketplace.json',
      },
    ]);

    const resolved = await getRawMarketplaceItemById(
      createRequest(),
      'phoenix',
      'team-a',
    );

    expect(resolved).toEqual({
      item: group.items[0],
      source: 'internal-mirror',
      sourceLabel: 'Internal Mirror',
      sourceUrl: 'https://internal.example.com/marketplace.json',
    });
  });

  it('returns the first matching source when an item exists in several', async () => {
    vi.mocked(getArkApiAuthHeaders).mockResolvedValueOnce({});
    mockGet.mockResolvedValueOnce([
      { ...group, source: 'agents-at-scale-marketplace' },
      { ...group, source: 'internal-mirror' },
    ]);

    const resolved = await getRawMarketplaceItemById(
      createRequest(),
      'phoenix',
      'team-a',
    );

    expect(resolved?.source).toBe('agents-at-scale-marketplace');
  });

  it('labels the item with the source display name', async () => {
    vi.mocked(getArkApiAuthHeaders).mockResolvedValueOnce({});
    mockGet.mockResolvedValueOnce([
      { ...group, source: 'internal-mirror', displayName: 'Internal Mirror' },
    ]);

    const item = await getMarketplaceItemById(
      createRequest(),
      'phoenix',
      'team-a',
    );

    expect(item?.source).toBe('Internal Mirror');
  });
});
