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
});
