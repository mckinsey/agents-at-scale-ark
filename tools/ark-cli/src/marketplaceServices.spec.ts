import {jest} from '@jest/globals';
import type {ServiceCollection} from './types/arkService.js';
import type {AnthropicMarketplaceManifest} from './types/marketplace.js';

const mockGetMarketplaceServicesFromManifest = jest.fn<
  () => Promise<ServiceCollection | null>
>();
const mockFetchMarketplaceManifest = jest.fn<
  () => Promise<AnthropicMarketplaceManifest | null>
>();

jest.unstable_mockModule('./lib/marketplaceFetcher.js', () => ({
  getMarketplaceServicesFromManifest: mockGetMarketplaceServicesFromManifest,
  fetchMarketplaceManifest: mockFetchMarketplaceManifest,
}));

const {
  getAllMarketplaceServices,
  getMarketplaceService,
  getAllMarketplaceServicesSync,
  getMarketplaceServiceSync,
  fallbackMarketplaceServices,
} = await import('./marketplaceServices.js');

describe('marketplaceServices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMarketplaceServicesFromManifest.mockClear();
  });

  describe('getAllMarketplaceServices', () => {
    it('returns manifest services when available', async () => {
      const mockServices = {
        'new-service': {
          name: 'new-service',
          helmReleaseName: 'new-service',
          description: 'New service',
          enabled: true,
          category: 'marketplace',
          namespace: 'new-ns',
        },
      };

      mockGetMarketplaceServicesFromManifest.mockResolvedValue(mockServices);

      const result = await getAllMarketplaceServices();

      expect(result).toEqual(mockServices);
      expect(mockGetMarketplaceServicesFromManifest).toHaveBeenCalled();
    });

    it('falls back to hardcoded services when manifest unavailable', async () => {
      mockGetMarketplaceServicesFromManifest.mockResolvedValue(null);

      const result = await getAllMarketplaceServices();

      expect(result).toEqual(fallbackMarketplaceServices);
      expect(result['phoenix']).toBeDefined();
      expect(result['langfuse']).toBeDefined();
    });

  });

  describe('getMarketplaceService', () => {
    it('returns service by name from manifest', async () => {
      const mockServices = {
        'test-service': {
          name: 'test-service',
          helmReleaseName: 'test-service',
          description: 'Test',
          enabled: true,
          category: 'marketplace',
        },
      };

      mockGetMarketplaceServicesFromManifest.mockResolvedValue(mockServices);
      await getAllMarketplaceServices();

      const result = await getMarketplaceService('test-service');

      expect(result).toEqual(mockServices['test-service']);
    });

    it('returns undefined for non-existent service', async () => {
      const mockServices = {
        'test-service': {
          name: 'test-service',
          helmReleaseName: 'test-service',
          description: 'Test',
          enabled: true,
          category: 'marketplace',
        },
      };
      mockGetMarketplaceServicesFromManifest.mockResolvedValue(mockServices);
      await getAllMarketplaceServices();

      const result = await getMarketplaceService('non-existent');

      expect(result).toBeUndefined();
    });

    it('falls back to hardcoded services', async () => {
      mockGetMarketplaceServicesFromManifest.mockResolvedValue(null);
      await getAllMarketplaceServices();

      const result = await getMarketplaceService('phoenix');

      expect(result).toEqual(fallbackMarketplaceServices['phoenix']);
    });
  });

  describe('getAllMarketplaceServicesSync', () => {
    it('returns fallback services immediately', () => {
      const result = getAllMarketplaceServicesSync();

      expect(result).toEqual(fallbackMarketplaceServices);
      expect(mockGetMarketplaceServicesFromManifest).not.toHaveBeenCalled();
    });
  });

  describe('getMarketplaceServiceSync', () => {
    it('returns service from fallback services', () => {
      const result = getMarketplaceServiceSync('phoenix');

      expect(result).toEqual(fallbackMarketplaceServices['phoenix']);
    });

    it('returns undefined for non-existent service', () => {
      const result = getMarketplaceServiceSync('non-existent');

      expect(result).toBeUndefined();
    });
  });
});

