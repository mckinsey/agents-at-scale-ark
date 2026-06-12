/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { filesApiClient } from '@/lib/api/files-client';
import { filesService } from '@/lib/services/files';
import type {
  DeleteDirectoryResponse,
  ListFilesResponse,
} from '@/lib/types/files';

vi.mock('@/lib/api/files-client', () => ({
  filesApiClient: {
    get: vi.fn(),
    delete: vi.fn(),
    buildUrl: vi.fn((endpoint: string) => `/api/v1/proxy/services/file-gateway-api/${endpoint}?namespace=test-namespace&_t=1234567890`),
  },
  FILES_API_BASE_URL: '/api/v1/proxy/services/file-gateway-api/',
}));

describe('filesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should fetch files with no parameters', async () => {
      const mockResponse: ListFilesResponse = {
        files: [
          {
            key: 'file1.txt',
            size: 1024,
            last_modified: '2025-01-01T00:00:00Z',
            etag: 'etag1',
          },
        ],
        directories: [{ prefix: 'dir1/' }],
      };

      vi.mocked(filesApiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await filesService.list();

      expect(filesApiClient.get).toHaveBeenCalledWith('files', {
        params: {},
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch files with prefix parameter', async () => {
      const mockResponse: ListFilesResponse = {
        files: [
          {
            key: 'dir1/file2.txt',
            size: 2048,
            last_modified: '2025-01-02T00:00:00Z',
            etag: 'etag2',
          },
        ],
        directories: [],
      };

      vi.mocked(filesApiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await filesService.list({ prefix: 'dir1/' });

      expect(filesApiClient.get).toHaveBeenCalledWith('files', {
        params: { prefix: 'dir1/' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch files with all parameters', async () => {
      const mockResponse: ListFilesResponse = {
        files: [],
        directories: [],
        next_token: 'next-token-123',
      };

      vi.mocked(filesApiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await filesService.list({
        prefix: 'documents/',
        max_keys: 50,
        continuation_token: 'token-abc',
      });

      expect(filesApiClient.get).toHaveBeenCalledWith('files', {
        params: {
          prefix: 'documents/',
          max_keys: 50,
          continuation_token: 'token-abc',
        },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('delete', () => {
    it('should delete a file by key', async () => {
      vi.mocked(filesApiClient.delete).mockResolvedValueOnce(undefined);

      await filesService.delete('test-file.txt');

      expect(filesApiClient.delete).toHaveBeenCalledWith(
        'files/test-file.txt',
      );
    });

    it('should URL encode the file key', async () => {
      vi.mocked(filesApiClient.delete).mockResolvedValueOnce(undefined);

      await filesService.delete('folder/file with spaces.txt');

      expect(filesApiClient.delete).toHaveBeenCalledWith(
        'files/folder%2Ffile%20with%20spaces.txt',
      );
    });
  });

  describe('deleteDirectory', () => {
    it('should delete a directory by prefix', async () => {
      const mockResponse: DeleteDirectoryResponse = {
        deleted_count: 5,
      };

      vi.mocked(filesApiClient.delete).mockResolvedValueOnce(mockResponse);

      const result = await filesService.deleteDirectory('test-dir/');

      expect(filesApiClient.delete).toHaveBeenCalledWith('directories', {
        params: { prefix: 'test-dir/' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return deletion count', async () => {
      const mockResponse: DeleteDirectoryResponse = {
        deleted_count: 42,
      };

      vi.mocked(filesApiClient.delete).mockResolvedValueOnce(mockResponse);

      const result = await filesService.deleteDirectory('documents/');

      expect(result.deleted_count).toBe(42);
    });
  });

  describe('upload', () => {
    let mockXHR: any;
    let xhrInstances: any[];

    beforeEach(() => {
      xhrInstances = [];
      mockXHR = {
        open: vi.fn(),
        send: vi.fn(),
        upload: {
          addEventListener: vi.fn(),
        },
        addEventListener: vi.fn(),
      };

      global.XMLHttpRequest = vi.fn(function () {
        xhrInstances.push(mockXHR);
        return mockXHR;
      }) as unknown as typeof XMLHttpRequest;
    });

    it('should upload file with FormData using buildUrl for namespace support', async () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const prefix = 'uploads/';

      const uploadPromise = filesService.upload(file, prefix);

      // Verify buildUrl was called to construct the URL with namespace
      expect(filesApiClient.buildUrl).toHaveBeenCalledWith('files');
      // Verify the URL includes namespace from buildUrl
      expect(mockXHR.open).toHaveBeenCalledWith(
        'POST',
        '/api/v1/proxy/services/file-gateway-api/files?namespace=test-namespace&_t=1234567890',
      );
      expect(mockXHR.send).toHaveBeenCalled();

      const loadCallback = mockXHR.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'load',
      )?.[1];

      mockXHR.status = 200;
      loadCallback?.();

      await expect(uploadPromise).resolves.toBeUndefined();
    });

    it('should call progress callback during upload', async () => {
      const file = new File(['content'], 'test.txt');
      const prefix = 'uploads/';
      const onProgress = vi.fn();

      filesService.upload(file, prefix, onProgress);

      const progressCallback = mockXHR.upload.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'progress',
      )?.[1];

      progressCallback?.({ lengthComputable: true, loaded: 50, total: 100 });
      expect(onProgress).toHaveBeenCalledWith(50);

      progressCallback?.({ lengthComputable: true, loaded: 100, total: 100 });
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('should not call progress callback if not provided', async () => {
      const file = new File(['content'], 'test.txt');
      const prefix = 'uploads/';

      filesService.upload(file, prefix);

      const progressCallback = mockXHR.upload.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'progress',
      )?.[1];

      expect(() => {
        progressCallback?.({ lengthComputable: true, loaded: 50, total: 100 });
      }).not.toThrow();
    });

    it('should reject on upload error', async () => {
      const file = new File(['content'], 'test.txt');
      const prefix = 'uploads/';

      const uploadPromise = filesService.upload(file, prefix);

      const errorCallback = mockXHR.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'error',
      )?.[1];

      errorCallback?.();

      await expect(uploadPromise).rejects.toThrow('Upload failed');
    });

    it('should reject on non-2xx status code', async () => {
      const file = new File(['content'], 'test.txt');
      const prefix = 'uploads/';

      const uploadPromise = filesService.upload(file, prefix);

      const loadCallback = mockXHR.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'load',
      )?.[1];

      mockXHR.status = 500;
      loadCallback?.();

      await expect(uploadPromise).rejects.toThrow(
        'Upload failed with status 500',
      );
    });
  });

  describe('download', () => {
    let windowOpenSpy: any;

    beforeEach(() => {
      windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should use buildUrl to construct download URL with namespace', () => {
      filesService.download('test-file.txt');

      // Verify buildUrl was called with the correct endpoint
      expect(filesApiClient.buildUrl).toHaveBeenCalledWith(
        'files/test-file.txt/download',
      );
      // Verify the URL returned by buildUrl (with namespace) is used
      expect(windowOpenSpy).toHaveBeenCalledWith(
        '/api/v1/proxy/services/file-gateway-api/files/test-file.txt/download?namespace=test-namespace&_t=1234567890',
        '_blank',
      );
    });

    it('should URL encode the file key in download URL', () => {
      filesService.download('folder/file with spaces.txt');

      expect(filesApiClient.buildUrl).toHaveBeenCalledWith(
        'files/folder%2Ffile%20with%20spaces.txt/download',
      );
    });
  });
});
