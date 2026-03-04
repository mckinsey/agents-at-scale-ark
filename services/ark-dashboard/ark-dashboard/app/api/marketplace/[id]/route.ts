import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { MarketplaceItemDetail } from '@/lib/api/generated/marketplace-types';
import { getMarketplaceItemById } from '@/lib/services/marketplace-fetcher';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const item = await getMarketplaceItemById(id);

    if (!item) {
      return NextResponse.json(
        { error: 'Marketplace item not found' },
        { status: 404 },
      );
    }

    // Convert to detailed item (for now, just add empty arrays for extra fields)
    const detailedItem: MarketplaceItemDetail = {
      ...item,
      longDescription: item.description,
      requirements: [],
      dependencies: [],
      configuration: {},
      changelog: [],
      reviews: [],
    };

    return NextResponse.json(detailedItem);
  } catch (error) {
    console.error('Error fetching marketplace item:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace item' },
      { status: 500 },
    );
  }
}
