import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockFetch = vi.fn() as Mock;
global.fetch = mockFetch;

function makeManifest(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    marketplace: 'test',
    items: [{ name: 'item-one', description: 'A test item' }],
    ...overrides,
  };
}

function mockFetchSuccess(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  });
}

function mockFetchHttpError(status = 404, statusText = 'Not Found') {
  mockFetch.mockResolvedValueOnce({ ok: false, status, statusText });
}

function createRequest(body: unknown) {
  return new NextRequest('http://localhost/api/marketplace/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/marketplace/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid=true for a well-formed manifest', async () => {
    mockFetchSuccess(makeManifest());
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.itemCount).toBe(1);
  });

  it('should return 400 when url is missing', async () => {
    const res = await POST(createRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('should return valid=false when fetch returns HTTP error', async () => {
    mockFetchHttpError(404);
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toContain('HTTP 404');
  });

  it('should return valid=false when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe('The URL did not return valid JSON');
  });

  it('should return valid=false when response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError('unexpected token'); },
    });
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe('The URL did not return valid JSON');
  });

  it('should return valid=false when manifest is missing version', async () => {
    mockFetchSuccess(makeManifest({ version: undefined }));
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe('JSON does not match the marketplace schema');
  });

  it('should return valid=false when manifest is missing marketplace field', async () => {
    mockFetchSuccess(makeManifest({ marketplace: undefined }));
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('should return valid=false when items is not an array', async () => {
    mockFetchSuccess(makeManifest({ items: 'not-an-array' }));
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('should return valid=false when an item is missing name', async () => {
    mockFetchSuccess(makeManifest({ items: [{ description: 'no name here' }] }));
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('should return valid=true when items array is empty', async () => {
    mockFetchSuccess(makeManifest({ items: [] }));
    const res = await POST(createRequest({ url: 'https://example.com/marketplace.json' }));
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.itemCount).toBe(0);
  });
});
