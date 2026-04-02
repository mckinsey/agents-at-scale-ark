import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/services/marketplace-fetcher', () => ({
  getMarketplaceItemById: vi.fn(),
}));

import { getMarketplaceItemById } from '@/lib/services/marketplace-fetcher';

function createRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost'));
}

const mockItem = {
  id: 'phoenix',
  name: 'Phoenix',
  description: 'Observability platform for LLMs',
  shortDescription: 'Observability platform',
  category: 'observability',
  type: 'service',
  version: '1.0.0',
  author: 'Arize AI',
  status: 'available',
  featured: false,
  downloads: 100,
  tags: ['observability'],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

describe('GET /api/marketplace/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return detailed item when found', async () => {
    vi.mocked(getMarketplaceItemById).mockResolvedValueOnce(mockItem);

    const request = createRequest('http://localhost/api/marketplace/phoenix');
    const response = await GET(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('phoenix');
    expect(data.name).toBe('Phoenix');
    expect(data.longDescription).toBe(mockItem.description);
    expect(data.requirements).toEqual([]);
    expect(data.dependencies).toEqual([]);
    expect(data.configuration).toEqual({});
    expect(data.changelog).toEqual([]);
    expect(data.reviews).toEqual([]);
  });

  it('should return 404 when item not found', async () => {
    vi.mocked(getMarketplaceItemById).mockResolvedValueOnce(null);

    const request = createRequest('http://localhost/api/marketplace/nonexistent');
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Marketplace item not found');
  });

  it('should return 500 on error', async () => {
    vi.mocked(getMarketplaceItemById).mockRejectedValueOnce(new Error('fetch failed'));

    const request = createRequest('http://localhost/api/marketplace/phoenix');
    const response = await GET(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch marketplace item');
  });

  it('should preserve all base item fields in detailed response', async () => {
    vi.mocked(getMarketplaceItemById).mockResolvedValueOnce(mockItem);

    const request = createRequest('http://localhost/api/marketplace/phoenix');
    const response = await GET(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.category).toBe('observability');
    expect(data.type).toBe('service');
    expect(data.version).toBe('1.0.0');
    expect(data.author).toBe('Arize AI');
    expect(data.tags).toEqual(['observability']);
  });
});
