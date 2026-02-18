import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type {
  MarketplaceFilters,
  MarketplaceResponse,
} from '@/lib/api/generated/marketplace-types';
import { getMarketplaceItems } from '@/lib/services/marketplace-fetcher';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const categoryParam = searchParams.get('category');
    const typeParam = searchParams.get('type');
    const statusParam = searchParams.get('status');

    const filters: MarketplaceFilters = {
      category: categoryParam as MarketplaceFilters['category'],
      type: typeParam as MarketplaceFilters['type'],
      status: statusParam as MarketplaceFilters['status'],
      search: searchParams.get('search') || undefined,
      featured: searchParams.get('featured') === 'true',
    };

    // Fetch all items from GitHub
    let items = await getMarketplaceItems();

    // Apply filters
    if (filters.category) {
      items = items.filter(item => item.category === filters.category);
    }
    if (filters.type) {
      items = items.filter(item => item.type === filters.type);
    }
    if (filters.status) {
      items = items.filter(item => item.status === filters.status);
    }
    if (filters.featured) {
      items = items.filter(item => item.featured === true);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      items = items.filter(
        item =>
          item.name.toLowerCase().includes(searchLower) ||
          item.description.toLowerCase().includes(searchLower) ||
          item.tags.some(tag => tag.toLowerCase().includes(searchLower)),
      );
    }

    // Pagination (for now, return all items)
    const response: MarketplaceResponse = {
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching marketplace items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace items' },
      { status: 500 },
    );
  }
}
