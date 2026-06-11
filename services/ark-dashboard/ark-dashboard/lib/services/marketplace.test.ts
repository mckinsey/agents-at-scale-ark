import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { marketplaceService } from '@/lib/services/marketplace';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const NS = 'team-a';
const SOURCES_BASE = `/api/v1/namespaces/${NS}/marketplace-sources`;

describe('marketplaceService sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists sources from the namespaced ConfigMap endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([
      { name: 'a', url: 'https://a.test/marketplace.json' },
    ]);
    const result = await marketplaceService.getMarketplaceSources(NS);
    expect(apiClient.get).toHaveBeenCalledWith(SOURCES_BASE);
    expect(result).toHaveLength(1);
  });

  it('creates a source via POST', async () => {
    const body = { name: 'internal', url: 'https://i.test/marketplace.json' };
    vi.mocked(apiClient.post).mockResolvedValueOnce(body);
    await marketplaceService.createMarketplaceSource(NS, body);
    expect(apiClient.post).toHaveBeenCalledWith(SOURCES_BASE, body);
  });

  it('deletes a source via DELETE on the encoded name', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);
    await marketplaceService.deleteMarketplaceSource(NS, 'internal');
    expect(apiClient.delete).toHaveBeenCalledWith(`${SOURCES_BASE}/internal`);
  });

  it('reads the permission probe', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ canEdit: true });
    const result = await marketplaceService.getMarketplaceSourcePermissions(NS);
    expect(apiClient.get).toHaveBeenCalledWith(`${SOURCES_BASE}/permissions`);
    expect(result.canEdit).toBe(true);
  });
});

describe('marketplaceService items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates and filters items from the namespace items endpoint', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.endsWith('/marketplace-items')) {
        return [
          {
            source: 'a',
            displayName: 'A',
            items: [
              { name: 'phoenix', description: 'obs', category: 'observability', type: 'service' },
              { name: 'helper', description: 'tool', category: 'tools', type: 'service' },
            ],
          },
        ];
      }
      // install-detection calls (helm releases / services)
      return { items: [] };
    });

    const all = await marketplaceService.getMarketplaceItems(NS);
    expect(all.items).toHaveLength(2);

    const filtered = await marketplaceService.getMarketplaceItems(NS, {
      category: 'observability',
    });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].category).toBe('observability');

    expect((await marketplaceService.getMarketplaceItems(NS, { type: 'service' })).items).toHaveLength(2);
    expect((await marketplaceService.getMarketplaceItems(NS, { status: 'installed' })).items).toHaveLength(0);
    expect((await marketplaceService.getMarketplaceItems(NS, { featured: true })).items).toHaveLength(0);
    expect((await marketplaceService.getMarketplaceItems(NS, { search: 'phoenix' })).items).toHaveLength(1);
  });
});

describe('marketplaceService item actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gets an item by id, installs and uninstalls via the dashboard routes', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ id: 'phoenix' });
    await marketplaceService.getMarketplaceItemById('phoenix', NS);
    expect(apiClient.get).toHaveBeenCalledWith('/api/marketplace/phoenix', {
      params: { namespace: NS },
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce({});
    await marketplaceService.installMarketplaceItem('phoenix', NS);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/marketplace/phoenix/install',
      { mode: 'command' },
      { params: { namespace: NS } },
    );

    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);
    await marketplaceService.uninstallMarketplaceItem('phoenix', NS);
    expect(apiClient.delete).toHaveBeenCalledWith('/api/marketplace/phoenix/install', {
      params: { namespace: NS },
    });
  });
});
