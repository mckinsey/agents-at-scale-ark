import { describe, it, expect, beforeEach, vi } from 'vitest';
import { modelsService } from '@/lib/services/models';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  withNamespace: vi.fn((ns?: string) =>
    ns ? { params: { namespace: ns } } : undefined,
  ),
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

const mockModelDetail = {
  name: 'test-model',
  provider: 'openai',
};

describe('modelsService namespace support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('passes namespace as query parameter when provided', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockModelDetail);

      await modelsService.create(
        { name: 'test-model', provider: 'openai' },
        { namespace: 'custom-ns' },
      );

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/models',
        { name: 'test-model', provider: 'openai' },
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('update', () => {
    it('passes namespace as query parameter when provided', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockModelDetail);

      await modelsService.update('test-model', { provider: 'azure' }, {
        namespace: 'custom-ns',
      });

      expect(apiClient.put).toHaveBeenCalledWith(
        '/api/v1/models/test-model',
        { provider: 'azure' },
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('delete', () => {
    it('passes namespace as query parameter when provided', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await modelsService.delete('test-model', { namespace: 'custom-ns' });

      expect(apiClient.delete).toHaveBeenCalledWith(
        '/api/v1/models/test-model',
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('getById', () => {
    it('passes namespace to getByName', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockModelDetail);

      await modelsService.getById('test-model', { namespace: 'custom-ns' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/models/test-model',
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('updateById', () => {
    it('passes namespace to update', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockModelDetail);

      await modelsService.updateById('test-model', { provider: 'azure' }, {
        namespace: 'custom-ns',
      });

      expect(apiClient.put).toHaveBeenCalledWith(
        '/api/v1/models/test-model',
        { provider: 'azure' },
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('deleteById', () => {
    it('passes namespace to delete', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await modelsService.deleteById('test-model', { namespace: 'custom-ns' });

      expect(apiClient.delete).toHaveBeenCalledWith(
        '/api/v1/models/test-model',
        { params: { namespace: 'custom-ns' } },
      );
    });
  });
});
