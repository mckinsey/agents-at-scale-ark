import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/services/marketplace-fetcher', () => ({
  getMarketplaceItemsFromSources: vi.fn(),
}));

import { getMarketplaceItemsFromSources } from '@/lib/services/marketplace-fetcher';

function createRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

const mockItems = [
  {
    id: 'phoenix',
    name: 'Phoenix',
    description: 'Observability platform for LLMs',
    shortDescription: 'Observability platform',
    category: 'observability',
    type: 'service',
    version: '1.0.0',
    author: 'Arize AI',
    status: 'available',
    featured: true,
    downloads: 100,
    tags: ['observability', 'tracing'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'langfuse',
    name: 'Langfuse',
    description: 'Open source LLM engineering platform',
    shortDescription: 'LLM engineering platform',
    category: 'observability',
    type: 'component',
    version: '2.0.0',
    author: 'Langfuse',
    status: 'installed',
    featured: false,
    downloads: 50,
    tags: ['analytics', 'monitoring'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'a2a-inspector',
    name: 'A2A Inspector',
    description: 'Agent-to-agent inspection tool',
    shortDescription: 'A2A inspection tool',
    category: 'tools',
    type: 'service',
    version: '1.0.0',
    author: 'Community',
    status: 'available',
    featured: false,
    downloads: 10,
    tags: ['a2a', 'debugging'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

describe('GET /api/marketplace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all items when no filters applied', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce(mockItems);

    const request = createRequest('http://localhost/api/marketplace');
    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toHaveLength(3);
    expect(data.total).toBe(3);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(3);
  });

  it('should filter by category', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce(mockItems);

    const request = createRequest('http://localhost/api/marketplace?category=observability');
    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toHaveLength(2);
    expect(data.items.every((i: { category: string }) => i.category === 'observability')).toBe(true);
  });

  it('should filter by type', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce(mockItems);

    const request = createRequest('http://localhost/api/marketplace?type=service');
    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toHaveLength(2);
    expect(data.items.every((i: { type: string }) => i.type === 'service')).toBe(true);
  });

  it('should filter by status', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce(mockItems);

    const request = createRequest('http://localhost/api/marketplace?status=installed');
    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe('langfuse');
  });

  it('should filter by featured', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce(mockItems);

    const request = createRequest('http://localhost/api/marketplace?featured=true');
    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe('phoenix');
  });

  it('should filter by search matching name', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce(mockItems);

    const request = createRequest('http://localhost/api/marketplace?search=phoenix');
    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe('phoenix');
  });

  it('should filter by search matching description', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce(mockItems);

    const request = createRequest('http://localhost/api/marketplace?search=engineering');
    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe('langfuse');
  });

  it('should filter by search matching tags', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce(mockItems);

    const request = createRequest('http://localhost/api/marketplace?search=debugging');
    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe('a2a-inspector');
  });

  it('should parse X-Marketplace-Sources header and pass to fetcher', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce([]);

    const sources = [{ id: 'custom', name: 'Custom', url: 'https://example.com/manifest.json' }];
    const request = createRequest('http://localhost/api/marketplace', {
      headers: { 'X-Marketplace-Sources': JSON.stringify(sources) },
    });
    const response = await GET(request);
    await response.json();

    expect(getMarketplaceItemsFromSources).toHaveBeenCalledWith(sources);
  });

  it('should handle invalid X-Marketplace-Sources header gracefully', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockResolvedValueOnce([]);

    const request = createRequest('http://localhost/api/marketplace', {
      headers: { 'X-Marketplace-Sources': 'not-json' },
    });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getMarketplaceItemsFromSources).toHaveBeenCalledWith(undefined);
    expect(data.items).toHaveLength(0);
  });

  it('should return 500 when fetcher throws', async () => {
    vi.mocked(getMarketplaceItemsFromSources).mockRejectedValueOnce(new Error('fetch failed'));

    const request = createRequest('http://localhost/api/marketplace');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch marketplace items');
  });
});
