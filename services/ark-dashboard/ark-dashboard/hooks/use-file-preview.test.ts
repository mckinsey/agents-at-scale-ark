import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFilePreview } from './use-file-preview';

const buildUrl = vi.fn((endpoint: string) => `http://test/${endpoint}`);

vi.mock('@/lib/api/files-client', () => ({
  FILES_API_BASE_URL: 'http://test',
  filesApiClient: { buildUrl: (endpoint: string) => buildUrl(endpoint) },
}));

vi.mock('@/lib/api/config', () => ({
  API_CONFIG: { baseUrl: 'http://test' },
  apiUrl: (path: string) => `http://test${path}`,
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

const zipForEach = vi.fn();
vi.mock('jszip', () => ({
  default: { loadAsync: vi.fn(async () => ({ forEach: zipForEach })) },
}));

function blobOf(content: string, type: string): Blob {
  const blob = new Blob([content], { type });
  Object.defineProperty(blob, 'text', { value: async () => content });
  return blob;
}

function mockResponse(
  body: { blob?: Blob; json?: unknown },
  ok = true,
): Response {
  return {
    ok,
    statusText: ok ? 'OK' : 'Not Found',
    blob: async () => body.blob ?? blobOf('', 'text/plain'),
    json: async () => body.json ?? {},
  } as unknown as Response;
}

function setFetch(impl: () => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe('useFilePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  it('opens a plain text file', async () => {
    setFetch(async () =>
      mockResponse({ blob: blobOf('hello world', 'text/plain') }),
    );

    const { result } = renderHook(() => useFilePreview());

    await act(async () => {
      await result.current.handlePreview('dir/notes.txt');
    });

    expect(result.current.previewOpen).toBe(true);
    expect(result.current.file?.key).toBe('dir/notes.txt');
    expect(result.current.file?.fileName).toBe('notes.txt');
    expect(result.current.file?.content).toBe('hello world');
    expect(result.current.file?.loading).toBe(false);
    expect(result.current.file?.isImage).toBe(false);
    expect(result.current.file?.isJson).toBe(false);
  });

  it('parses valid JSON and flags invalid JSON', async () => {
    setFetch(async () =>
      mockResponse({
        blob: blobOf('{"a":1}', 'application/json'),
      }),
    );
    const { result } = renderHook(() => useFilePreview());
    await act(async () => {
      await result.current.handlePreview('data.json');
    });
    expect(result.current.file?.isJson).toBe(true);
    expect(result.current.file?.jsonData).toEqual({ a: 1 });

    setFetch(async () =>
      mockResponse({
        blob: blobOf('not json', 'application/json'),
      }),
    );
    await act(async () => {
      await result.current.handlePreview('broken.json');
    });
    expect(result.current.file?.isJson).toBe(false);
  });

  it('creates an object URL for image files', async () => {
    setFetch(async () =>
      mockResponse({
        blob: blobOf('imgbytes', 'image/png'),
      }),
    );
    const { result } = renderHook(() => useFilePreview());
    await act(async () => {
      await result.current.handlePreview('pic.png');
    });
    expect(result.current.file?.isImage).toBe(true);
    expect(result.current.file?.imageUrl).toBe('blob:mock-url');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('handles SVG files as images via text', async () => {
    setFetch(async () =>
      mockResponse({
        blob: blobOf('<svg></svg>', 'image/svg+xml'),
      }),
    );
    const { result } = renderHook(() => useFilePreview());
    await act(async () => {
      await result.current.handlePreview('icon.svg');
    });
    expect(result.current.file?.isImage).toBe(true);
    expect(result.current.file?.imageUrl).toBe('blob:mock-url');
  });

  it('parses ZIP archives and sorts directories first', async () => {
    zipForEach.mockImplementation(
      (cb: (path: string, entry: unknown) => void) => {
        cb('root/a.txt', {
          name: 'root/a.txt',
          dir: false,
          date: new Date('2020-01-01'),
          _data: { uncompressedSize: 10, compressedSize: 5 },
        });
        cb('root/', {
          name: 'root/',
          dir: true,
          date: new Date('2020-01-01'),
          _data: { uncompressedSize: 0, compressedSize: 0 },
        });
      },
    );
    setFetch(async () =>
      mockResponse({
        blob: blobOf('zipbytes', 'application/zip'),
      }),
    );
    const { result } = renderHook(() => useFilePreview());
    await act(async () => {
      await result.current.handlePreview('bundle.zip');
    });
    expect(result.current.file?.isZip).toBe(true);
    expect(result.current.file?.zipEntries).toHaveLength(2);
    expect(result.current.file?.zipEntries[0].isDirectory).toBe(true);
  });

  it('parses spreadsheets through the preview API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          blob: blobOf(
            'xlsxbytes',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ),
        }),
      )
      .mockResolvedValueOnce(mockResponse({ json: { sheets: [] } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useFilePreview());
    await act(async () => {
      await result.current.handlePreview('report.xlsx');
    });
    await waitFor(() => expect(result.current.file?.isSpreadsheet).toBe(true));
    expect(result.current.file?.spreadsheetData).toEqual({ sheets: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a toast and closes when the download fails', async () => {
    setFetch(async () => mockResponse({}, false));
    const { result } = renderHook(() => useFilePreview());
    await act(async () => {
      await result.current.handlePreview('missing.txt');
    });
    expect(toastError).toHaveBeenCalledWith(
      'Failed to Preview File',
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(result.current.file).toBeNull();
    expect(result.current.previewOpen).toBe(false);
  });

  it('replaces the previewed file when a new one is opened', async () => {
    setFetch(async () =>
      mockResponse({ blob: blobOf('imgbytes', 'image/png') }),
    );
    const { result } = renderHook(() => useFilePreview());
    await act(async () => {
      await result.current.handlePreview('first.png');
    });
    expect(result.current.file?.key).toBe('first.png');

    setFetch(async () =>
      mockResponse({ blob: blobOf('hello', 'text/plain') }),
    );
    await act(async () => {
      await result.current.handlePreview('second.txt');
    });
    expect(result.current.file?.key).toBe('second.txt');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('closes the preview and revokes the object URL', async () => {
    setFetch(async () =>
      mockResponse({ blob: blobOf('imgbytes', 'image/png') }),
    );
    const { result } = renderHook(() => useFilePreview());
    await act(async () => {
      await result.current.handlePreview('pic.png');
    });
    act(() => {
      result.current.close();
    });
    expect(result.current.file).toBeNull();
    expect(result.current.previewOpen).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
