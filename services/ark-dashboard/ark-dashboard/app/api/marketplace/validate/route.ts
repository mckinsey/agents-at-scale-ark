import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface MarketplaceManifest {
  version?: unknown;
  marketplace?: unknown;
  items?: unknown;
}

function isValidManifest(data: unknown): data is Required<MarketplaceManifest> {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as MarketplaceManifest;
  if (typeof d.version !== 'string') return false;
  if (typeof d.marketplace !== 'string') return false;
  if (!Array.isArray(d.items)) return false;
  return d.items.every(
    item => typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).name === 'string',
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: unknown };
    const url = body.url;

    if (typeof url !== 'string' || !url) {
      return NextResponse.json({ valid: false, error: 'URL is required' }, { status: 400 });
    }

    let data: unknown;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return NextResponse.json({
          valid: false,
          error: `Could not fetch the URL (HTTP ${response.status})`,
        });
      }

      data = await response.json();
    } catch {
      return NextResponse.json({
        valid: false,
        error: 'The URL did not return valid JSON',
      });
    }

    if (!isValidManifest(data)) {
      return NextResponse.json({
        valid: false,
        error: 'JSON does not match the marketplace schema',
      });
    }

    return NextResponse.json({ valid: true, itemCount: (data as Required<MarketplaceManifest>).items.length });
  } catch {
    return NextResponse.json({ valid: false, error: 'Invalid request' }, { status: 400 });
  }
}
