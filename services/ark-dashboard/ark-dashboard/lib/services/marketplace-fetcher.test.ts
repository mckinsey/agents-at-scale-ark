import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import {
  transformGitHubItemToMarketplaceItem,
  fetchMarketplaceManifest,
  fetchMarketplaceItemsFromSource,
  getMarketplaceItemsFromSources,
  getMarketplaceItems,
  getMarketplaceItemById,
  getRawMarketplaceItemById,
  type MarketplaceSource,
} from '@/lib/services/marketplace-fetcher'

vi.mock('@/lib/services/export', () => ({
  exportService: {
    fetchAllResources: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/lib/services/export-server', () => ({
  exportServiceServer: {
    fetchAllResources: vi.fn().mockResolvedValue({}),
  },
}))

const mockFetch = vi.fn() as Mock
global.fetch = mockFetch

function makeGitHubItem(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-item',
    description: 'A test item for testing purposes',
    ...overrides,
  }
}

function makeManifest(items: Record<string, unknown>[] = [makeGitHubItem()]) {
  return {
    version: '1.0.0',
    marketplace: 'test',
    items,
  }
}

function mockFetchSuccess(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  })
}

function mockFetchHttpError(status = 404, statusText = 'Not Found') {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
  })
}

const defaultSource: MarketplaceSource = {
  id: 'test-source',
  name: 'Test Source',
  url: 'https://example.org/manifest.json',
  displayName: 'Test Display',
  enabled: true,
}

describe('marketplace-fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('transformGitHubItemToMarketplaceItem', () => {
    describe('category mapping', () => {
      it.each([
        ['observability', 'observability'],
        ['tools', 'tools'],
        ['mcp-servers', 'mcp-servers'],
        ['mcp', 'mcp-servers'],
        ['agents', 'agents'],
        ['agent', 'agents'],
        ['models', 'models'],
        ['model', 'models'],
        ['workflows', 'workflows'],
        ['workflow', 'workflows'],
        ['integrations', 'integrations'],
        ['integration', 'integrations'],
      ])('maps "%s" to "%s"', (input, expected) => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ category: input }),
        )
        expect(result.category).toBe(expected)
      })

      it('maps unknown category to "tools"', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ category: 'something-unknown' }),
        )
        expect(result.category).toBe('tools')
      })

      it('maps undefined category to "tools"', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem(),
        )
        expect(result.category).toBe('tools')
      })

      it('handles case-insensitive category', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ category: 'Observability' }),
        )
        expect(result.category).toBe('observability')
      })
    })

    describe('type mapping', () => {
      it('maps "agent" to "template"', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ type: 'agent' }),
        )
        expect(result.type).toBe('template')
      })

      it('maps "service" to "service"', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ type: 'service' }),
        )
        expect(result.type).toBe('service')
      })

      it('maps undefined type to "component"', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem(),
        )
        expect(result.type).toBe('component')
      })
    })

    describe('ID generation', () => {
      it('lowercases the name', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ name: 'MyItem' }),
        )
        expect(result.id).toBe('myitem')
      })

      it('replaces non-alphanumeric characters with hyphens', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ name: 'my_item@v2' }),
        )
        expect(result.id).toBe('my-item-v2')
      })

      it('trims leading and trailing hyphens', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ name: '--my-item--' }),
        )
        expect(result.id).toBe('my-item')
      })

      it('handles complex names', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ name: '  @scope/My Package!! ' }),
        )
        expect(result.id).toBe('scope-my-package')
      })
    })

    describe('icon selection', () => {
      it('returns emoji by category for placeholder icon', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            icon: 'https://example.com/icon.png',
            category: 'observability',
          }),
        )
        expect(result.icon).toBe('📊')
      })

      it('returns emoji by name match for placeholder icon', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            name: 'phoenix-service',
            icon: 'https://example.com/icon.png',
          }),
        )
        expect(result.icon).toBe('🔥')
      })

      it('returns emoji by type for placeholder icon when no category or name match', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            name: 'unknown-thing',
            icon: 'https://example.com/icon.png',
            type: 'agent',
          }),
        )
        expect(result.icon).toBe('🤖')
      })

      it('returns service emoji for placeholder icon with service type', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            name: 'unknown-thing',
            icon: 'https://example.com/icon.png',
            type: 'service',
          }),
        )
        expect(result.icon).toBe('⚙️')
      })

      it('returns fallback 📦 for placeholder icon with no matches', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            name: 'unknown-thing',
            icon: 'https://example.com/icon.png',
          }),
        )
        expect(result.icon).toBe('📦')
      })

      it('returns original icon for non-placeholder URL', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            icon: 'https://cdn.real-site.com/icon.png',
          }),
        )
        expect(result.icon).toBe('https://cdn.real-site.com/icon.png')
      })

      it('returns 📦 when no icon is provided', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem(),
        )
        expect(result.icon).toBe('📦')
      })

      it('returns langfuse emoji for langfuse name with placeholder', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            name: 'langfuse',
            icon: 'https://example.com/placeholder.png',
          }),
        )
        expect(result.icon).toBe('📝')
      })
    })

    describe('field transformations', () => {
      it('uses displayName when available', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ name: 'raw-name', displayName: 'Pretty Name' }),
        )
        expect(result.name).toBe('Pretty Name')
      })

      it('falls back to name when displayName is missing', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ name: 'raw-name' }),
        )
        expect(result.name).toBe('raw-name')
      })

      it('truncates shortDescription to 150 chars', () => {
        const longDesc = 'A'.repeat(200)
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ description: longDesc }),
        )
        expect(result.shortDescription).toHaveLength(150)
        expect(result.description).toBe(longDesc)
      })

      it('generates installCommand from ark.helmReleaseName', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            ark: { helmReleaseName: 'phoenix', chartPath: './charts/phoenix' },
          }),
        )
        expect(result.installCommand).toBe('helm install phoenix ./charts/phoenix')
      })

      it('sets installCommand to undefined when no helmReleaseName', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ ark: {} }),
        )
        expect(result.installCommand).toBeUndefined()
      })

      it('filters screenshots with example.com URLs', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            screenshots: [
              'https://real.com/shot1.png',
              'https://example.com/placeholder.png',
              'https://real.com/shot2.png',
            ],
          }),
        )
        expect(result.screenshots).toEqual([
          'https://real.com/shot1.png',
          'https://real.com/shot2.png',
        ])
      })

      it('sets default version to 1.0.0', () => {
        const result = transformGitHubItemToMarketplaceItem(makeGitHubItem())
        expect(result.version).toBe('1.0.0')
      })

      it('sets default author to Community', () => {
        const result = transformGitHubItemToMarketplaceItem(makeGitHubItem())
        expect(result.author).toBe('Community')
      })

      it('sets default repository', () => {
        const result = transformGitHubItemToMarketplaceItem(makeGitHubItem())
        expect(result.repository).toBe(
          'https://github.com/mckinsey/agents-at-scale-marketplace',
        )
      })

      it('uses provided version and author', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ version: '2.0.0', author: 'TestAuthor' }),
        )
        expect(result.version).toBe('2.0.0')
        expect(result.author).toBe('TestAuthor')
      })

      it('sets status to "available" by default', () => {
        const result = transformGitHubItemToMarketplaceItem(makeGitHubItem())
        expect(result.status).toBe('available')
      })

      it('sets status to "installed" when isInstalled is true', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem(),
          true,
        )
        expect(result.status).toBe('installed')
      })

      it('sets featured to false and downloads to 0', () => {
        const result = transformGitHubItemToMarketplaceItem(makeGitHubItem())
        expect(result.featured).toBe(false)
        expect(result.downloads).toBe(0)
      })

      it('preserves tags', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ tags: ['monitoring', 'observability'] }),
        )
        expect(result.tags).toEqual(['monitoring', 'observability'])
      })

      it('defaults tags to empty array', () => {
        const result = transformGitHubItemToMarketplaceItem(makeGitHubItem())
        expect(result.tags).toEqual([])
      })

      it('uses homepage as documentation fallback', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ homepage: 'https://docs.example.org' }),
        )
        expect(result.documentation).toBe('https://docs.example.org')
      })

      it('prefers documentation over homepage', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({
            documentation: 'https://docs.official.com',
            homepage: 'https://homepage.com',
          }),
        )
        expect(result.documentation).toBe('https://docs.official.com')
      })

      it('sets createdAt and updatedAt to ISO strings', () => {
        const result = transformGitHubItemToMarketplaceItem(makeGitHubItem())
        expect(() => new Date(result.createdAt)).not.toThrow()
        expect(() => new Date(result.updatedAt)).not.toThrow()
      })

      it('handles empty description', () => {
        const result = transformGitHubItemToMarketplaceItem(
          makeGitHubItem({ description: '' }),
        )
        expect(result.description).toBe('')
        expect(result.shortDescription).toBe('')
      })
    })
  })

  describe('fetchMarketplaceManifest', () => {
    it('returns parsed manifest on success', async () => {
      const manifest = makeManifest()
      mockFetchSuccess(manifest)

      const result = await fetchMarketplaceManifest('https://test.com/manifest.json')

      expect(result).toEqual(manifest)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.com/manifest.json',
        expect.objectContaining({
          headers: { Accept: 'application/json' },
        }),
      )
    })

    it('uses default URL when none provided', async () => {
      mockFetchSuccess(makeManifest())

      await fetchMarketplaceManifest()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json',
        expect.anything(),
      )
    })

    it('returns null on HTTP error', async () => {
      mockFetchHttpError(500, 'Internal Server Error')

      const result = await fetchMarketplaceManifest('https://test.com/manifest.json')

      expect(result).toBeNull()
    })

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      const result = await fetchMarketplaceManifest('https://test.com/manifest.json')

      expect(result).toBeNull()
    })
  })

  describe('fetchMarketplaceItemsFromSource', () => {
    it('returns transformed items from a source', async () => {
      const manifest = makeManifest([
        makeGitHubItem({ name: 'phoenix', category: 'observability' }),
      ])
      mockFetchSuccess(manifest)

      const result = await fetchMarketplaceItemsFromSource(defaultSource)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('phoenix')
      expect(result[0].category).toBe('observability')
    })

    it('returns empty array when manifest fetch fails', async () => {
      mockFetchHttpError()

      const result = await fetchMarketplaceItemsFromSource(defaultSource)

      expect(result).toEqual([])
    })

    it('returns empty array when manifest has no items', async () => {
      mockFetchSuccess({ version: '1.0.0', marketplace: 'test' })

      const result = await fetchMarketplaceItemsFromSource(defaultSource)

      expect(result).toEqual([])
    })

    it('adds source displayName to items', async () => {
      mockFetchSuccess(makeManifest())

      const result = await fetchMarketplaceItemsFromSource(defaultSource)

      expect(result[0]).toHaveProperty('source', 'Test Display')
    })

    it('falls back to source name when displayName is missing', async () => {
      mockFetchSuccess(makeManifest())

      const sourceWithoutDisplay: MarketplaceSource = {
        id: 'test',
        name: 'Fallback Name',
        url: 'https://test.com/manifest.json',
      }

      const result = await fetchMarketplaceItemsFromSource(sourceWithoutDisplay)

      expect(result[0]).toHaveProperty('source', 'Fallback Name')
    })

    it('detects installed items from cluster resources', async () => {
      const { exportService } = await import('@/lib/services/export')
      vi.mocked(exportService.fetchAllResources).mockResolvedValueOnce({
        agents: [{ name: 'phoenix', yaml: '' }],
      })

      mockFetchSuccess(makeManifest([
        makeGitHubItem({ name: 'phoenix' }),
        makeGitHubItem({ name: 'langfuse' }),
      ]))

      const result = await fetchMarketplaceItemsFromSource(defaultSource)

      const phoenixItem = result.find(i => i.id === 'phoenix')
      const langfuseItem = result.find(i => i.id === 'langfuse')
      expect(phoenixItem?.status).toBe('installed')
      expect(langfuseItem?.status).toBe('available')
    })
  })

  describe('getMarketplaceItemsFromSources', () => {
    it('fetches from multiple sources in parallel', async () => {
      const source1: MarketplaceSource = {
        id: 's1', name: 'Source1', url: 'https://s1.com/m.json', enabled: true,
      }
      const source2: MarketplaceSource = {
        id: 's2', name: 'Source2', url: 'https://s2.com/m.json', enabled: true,
      }

      mockFetchSuccess(makeManifest([makeGitHubItem({ name: 'item-a' })]))
      mockFetchSuccess(makeManifest([makeGitHubItem({ name: 'item-b' })]))

      const result = await getMarketplaceItemsFromSources([source1, source2])

      expect(result).toHaveLength(2)
      expect(result.map(i => i.id)).toContain('item-a')
      expect(result.map(i => i.id)).toContain('item-b')
    })

    it('deduplicates items by ID keeping the first occurrence', async () => {
      const source1: MarketplaceSource = {
        id: 's1', name: 'Source1', url: 'https://s1.com/m.json', enabled: true,
      }
      const source2: MarketplaceSource = {
        id: 's2', name: 'Source2', url: 'https://s2.com/m.json', enabled: true,
      }

      mockFetchSuccess(makeManifest([
        makeGitHubItem({ name: 'same-item', description: 'from source 1' }),
      ]))
      mockFetchSuccess(makeManifest([
        makeGitHubItem({ name: 'same-item', description: 'from source 2' }),
      ]))

      const result = await getMarketplaceItemsFromSources([source1, source2])

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('from source 1')
    })

    it('skips disabled sources', async () => {
      const enabledSource: MarketplaceSource = {
        id: 's1', name: 'Enabled', url: 'https://enabled.com/m.json', enabled: true,
      }
      const disabledSource: MarketplaceSource = {
        id: 's2', name: 'Disabled', url: 'https://disabled.com/m.json', enabled: false,
      }

      mockFetchSuccess(makeManifest([makeGitHubItem({ name: 'enabled-item' })]))

      const result = await getMarketplaceItemsFromSources([enabledSource, disabledSource])

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('enabled-item')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('uses default source when none provided', async () => {
      mockFetchSuccess(makeManifest())

      await getMarketplaceItemsFromSources()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json',
        expect.anything(),
      )
    })

    it('uses default source when empty array provided', async () => {
      mockFetchSuccess(makeManifest())

      await getMarketplaceItemsFromSources([])

      expect(mockFetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json',
        expect.anything(),
      )
    })
  })

  describe('getMarketplaceItems', () => {
    it('delegates to getMarketplaceItemsFromSources with defaults', async () => {
      mockFetchSuccess(makeManifest([makeGitHubItem({ name: 'default-item' })]))

      const result = await getMarketplaceItems()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('default-item')
    })
  })

  describe('getMarketplaceItemById', () => {
    it('returns matching item by ID', async () => {
      mockFetchSuccess(
        makeManifest([
          makeGitHubItem({ name: 'phoenix', category: 'observability' }),
          makeGitHubItem({ name: 'langfuse', category: 'observability' }),
        ]),
      )

      const result = await getMarketplaceItemById('phoenix')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('phoenix')
    })

    it('returns null when no item matches', async () => {
      mockFetchSuccess(makeManifest([makeGitHubItem({ name: 'phoenix' })]))

      const result = await getMarketplaceItemById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getRawMarketplaceItemById', () => {
    it('returns raw GitHub item by ID', async () => {
      mockFetchSuccess(
        makeManifest([
          makeGitHubItem({ name: 'phoenix', description: 'raw phoenix' }),
          makeGitHubItem({ name: 'langfuse' }),
        ]),
      )

      const result = await getRawMarketplaceItemById('phoenix')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('phoenix')
      expect(result?.description).toBe('raw phoenix')
    })

    it('returns null when manifest fetch fails', async () => {
      mockFetchHttpError()

      const result = await getRawMarketplaceItemById('phoenix')

      expect(result).toBeNull()
    })

    it('returns null when no item matches', async () => {
      mockFetchSuccess(makeManifest([makeGitHubItem({ name: 'phoenix' })]))

      const result = await getRawMarketplaceItemById('nonexistent')

      expect(result).toBeNull()
    })

    it('returns null when manifest has no items', async () => {
      mockFetchSuccess({ version: '1.0.0', marketplace: 'test' })

      const result = await getRawMarketplaceItemById('phoenix')

      expect(result).toBeNull()
    })
  })
})
