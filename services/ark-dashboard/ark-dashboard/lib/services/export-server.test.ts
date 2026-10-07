import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getArkApiAuthHeaders } from '@/lib/auth/server-auth-headers';
import { exportServiceServer } from '@/lib/services/export-server';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('@/lib/api/server-client', () => ({
  serverApiClient: { get: mockGet },
}));

vi.mock('@/lib/auth/server-auth-headers', () => ({
  getArkApiAuthHeaders: vi.fn(),
}));

function createRequest() {
  return new NextRequest(new URL('http://localhost/api/export'));
}

describe('exportServiceServer.fetchAllResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ items: [] });
  });

  it('forwards the minted Authorization header to every resource fetch', async () => {
    vi.mocked(getArkApiAuthHeaders).mockResolvedValueOnce({
      Authorization: 'Bearer test-token',
    });

    await exportServiceServer.fetchAllResources(createRequest());

    expect(mockGet).toHaveBeenCalledTimes(6);
    for (const call of mockGet.mock.calls) {
      expect(call[1]).toMatchObject({
        headers: { Authorization: 'Bearer test-token' },
      });
    }
  });

  it('calls serverApiClient without a header when no session token is minted', async () => {
    vi.mocked(getArkApiAuthHeaders).mockResolvedValueOnce({});

    await exportServiceServer.fetchAllResources(createRequest());

    for (const call of mockGet.mock.calls) {
      expect(call[1]).toMatchObject({ headers: {} });
    }
  });
});
