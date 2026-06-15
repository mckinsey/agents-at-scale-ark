import { describe, it, expect, beforeEach, vi } from 'vitest';
import { marketplaceService } from '@/lib/services/marketplace';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 0,
};

describe('marketplaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('getMarketplaceItems', () => {
    it('should call apiClient.get with base url when no filters', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems();

      expect(apiClient.get).toHaveBeenCalledWith('/api/marketplace', { headers: {} });
    });

    it('should build query params from category filter', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems({ category: 'observability' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/marketplace?category=observability',
        { headers: {} },
      );
    });

    it('should build query params from type filter', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems({ type: 'service' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/marketplace?type=service',
        { headers: {} },
      );
    });

    it('should build query params from status filter', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems({ status: 'available' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/marketplace?status=available',
        { headers: {} },
      );
    });

    it('should build query params from search filter', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems({ search: 'phoenix' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/marketplace?search=phoenix',
        { headers: {} },
      );
    });

    it('should build query params from featured filter', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems({ featured: true });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/marketplace?featured=true',
        { headers: {} },
      );
    });

    it('should combine multiple filters into query string', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems({
        category: 'tools',
        type: 'component',
        search: 'test',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/marketplace?category=tools&type=component&search=test',
        { headers: {} },
      );
    });

    it('should add X-Marketplace-Sources header when sources in localStorage', async () => {
      const sources = [{ id: 'src-1', name: 'Source 1', url: 'https://example.com/manifest.json' }];
      localStorage.setItem('marketplace-sources', JSON.stringify(sources));
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems();

      expect(apiClient.get).toHaveBeenCalledWith('/api/marketplace', {
        headers: { 'X-Marketplace-Sources': JSON.stringify(sources) },
      });
    });

    it('should not add sources header when localStorage is empty', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems();

      expect(apiClient.get).toHaveBeenCalledWith('/api/marketplace', { headers: {} });
    });

    it('should not add sources header when localStorage has invalid JSON', async () => {
      localStorage.setItem('marketplace-sources', 'not-valid-json');
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      await marketplaceService.getMarketplaceItems();

      expect(apiClient.get).toHaveBeenCalledWith('/api/marketplace', { headers: {} });
    });
  });

  describe('getMarketplaceItemById', () => {
    it('should call apiClient.get with the correct url', async () => {
      const mockItem = { id: 'phoenix', name: 'Phoenix' };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockItem);

      const result = await marketplaceService.getMarketplaceItemById('phoenix');

      expect(apiClient.get).toHaveBeenCalledWith('/api/marketplace/phoenix');
      expect(result).toEqual(mockItem);
    });
  });

  describe('installMarketplaceItem', () => {
    it('should call apiClient.post with correct url and body', async () => {
      const mockResult = { status: 'command', helmCommand: 'helm install ...' };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResult);

      const result = await marketplaceService.installMarketplaceItem('phoenix');

      expect(apiClient.post).toHaveBeenCalledWith('/api/marketplace/phoenix/install', { mode: 'command' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('uninstallMarketplaceItem', () => {
    it('should call apiClient.delete with correct url', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await marketplaceService.uninstallMarketplaceItem('phoenix');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/marketplace/phoenix/install');
    });
  });
});
