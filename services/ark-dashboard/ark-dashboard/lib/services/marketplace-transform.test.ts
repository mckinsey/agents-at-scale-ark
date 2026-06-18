import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import {
  buildItemsFromGroups,
  transformGitHubItemToMarketplaceItem,
  type GitHubMarketplaceItem,
} from '@/lib/services/marketplace-transform';

vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn() } }));

function ghItem(overrides: Partial<GitHubMarketplaceItem> = {}): GitHubMarketplaceItem {
  return { name: 'phoenix', description: 'observability platform', ...overrides };
}

describe('transformGitHubItemToMarketplaceItem', () => {
  it('maps GitHub type to marketplace type', () => {
    expect(transformGitHubItemToMarketplaceItem(ghItem({ type: 'agent' })).type).toBe('template');
    expect(transformGitHubItemToMarketplaceItem(ghItem({ type: 'service' })).type).toBe('service');
    expect(transformGitHubItemToMarketplaceItem(ghItem({ type: 'demo' })).type).toBe('demo');
    expect(transformGitHubItemToMarketplaceItem(ghItem({ type: 'executor' })).type).toBe('executor');
    expect(transformGitHubItemToMarketplaceItem(ghItem({ type: undefined })).type).toBe('component');
  });

  it('maps category, defaulting unknown to tools', () => {
    expect(transformGitHubItemToMarketplaceItem(ghItem({ category: 'observability' })).category).toBe('observability');
    expect(transformGitHubItemToMarketplaceItem(ghItem({ category: 'nonsense' })).category).toBe('tools');
  });

  it('prefers displayName for the name and marks installed status', () => {
    const installed = transformGitHubItemToMarketplaceItem(
      ghItem({ displayName: 'Phoenix' }),
      true,
      'Ark',
    );
    expect(installed.name).toBe('Phoenix');
    expect(installed.status).toBe('installed');
    expect(installed.source).toBe('Ark');

    const available = transformGitHubItemToMarketplaceItem(ghItem());
    expect(available.status).toBe('available');
    expect(available.source).toBe('Unknown source');
  });

  it('builds an install command from ark.helmReleaseName', () => {
    const out = transformGitHubItemToMarketplaceItem(
      ghItem({ ark: { helmReleaseName: 'phoenix', chartPath: 'oci://x' } }),
    );
    expect(out.installCommand).toBe('helm install phoenix oci://x');
    expect(transformGitHubItemToMarketplaceItem(ghItem()).installCommand).toBeUndefined();
  });

  it('replaces example.com placeholder icons with emoji and filters screenshots', () => {
    const byCategory = transformGitHubItemToMarketplaceItem(
      ghItem({ icon: 'https://example.com/x.png', category: 'observability' }),
    );
    expect(byCategory.icon).toBe('📊');

    const byName = transformGitHubItemToMarketplaceItem(
      ghItem({ name: 'phoenix', icon: 'https://example.com/x.png' }),
    );
    expect(byName.icon).toBe('🔥');

    const realIcon = transformGitHubItemToMarketplaceItem(ghItem({ icon: 'https://cdn/x.png' }));
    expect(realIcon.icon).toBe('https://cdn/x.png');

    const screenshots = transformGitHubItemToMarketplaceItem(
      ghItem({ screenshots: ['https://example.com/a.png', 'https://cdn/b.png'] }),
    );
    expect(screenshots.screenshots).toEqual(['https://cdn/b.png']);
  });
});

describe('buildItemsFromGroups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flattens groups, dedups by id, and skips error groups', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });
    const groups = [
      {
        source: 'a',
        displayName: 'A',
        items: [ghItem({ name: 'phoenix', type: 'service' }), ghItem({ name: 'phoenix', type: 'service' })],
      },
      { source: 'b', displayName: 'B', error: { message: 'boom', code: 'http_error' } },
    ];
    const items = await buildItemsFromGroups(groups, 'team-a');
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('A');
    expect(items[0].status).toBe('available');
  });

  it('marks items installed and attaches service UIs from cluster state', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('ark-services')) {
        return {
          items: [
            {
              name: 'phoenix',
              status: 'deployed',
              chart_metadata: {
                annotations: { 'ark.mckinsey.com/marketplace-item-name': 'service/phoenix' },
              },
            },
          ],
        };
      }
      return {
        items: [
          {
            metadata: {
              labels: { 'app.kubernetes.io/instance': 'phoenix' },
              annotations: {
                'ark.mckinsey.com/marketplace-item-ui-url': 'http://ui',
                'ark.mckinsey.com/marketplace-item-ui-label': 'Open Phoenix',
              },
            },
          },
        ],
      };
    });

    const items = await buildItemsFromGroups(
      [{ source: 'a', displayName: 'A', items: [ghItem({ name: 'phoenix', type: 'service' })] }],
      'team-a',
    );
    expect(items[0].status).toBe('installed');
    expect(items[0].uis).toEqual([{ url: 'http://ui', label: 'Open Phoenix' }]);
  });

  it('degrades to available when install detection fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('api down'));
    const items = await buildItemsFromGroups(
      [{ source: 'a', displayName: 'A', items: [ghItem({ type: 'service' })] }],
      'team-a',
    );
    expect(items[0].status).toBe('available');
  });
});
