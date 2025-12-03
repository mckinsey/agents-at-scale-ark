import {jest} from '@jest/globals';
import type {ServiceCollection} from './types/arkService.js';
import type {AnthropicMarketplaceManifest} from './types/marketplace.js';

const mockGetMarketplaceServicesFromManifest = jest.fn<
  () => Promise<ServiceCollection | null>
>();
const mockGetMarketplaceAgentsFromManifest = jest.fn<
  () => Promise<ServiceCollection | null>
>();
const mockFetchMarketplaceManifest = jest.fn<
  () => Promise<AnthropicMarketplaceManifest | null>
>();

jest.unstable_mockModule('./lib/marketplaceFetcher.js', () => ({
  getMarketplaceServicesFromManifest: mockGetMarketplaceServicesFromManifest,
  getMarketplaceAgentsFromManifest: mockGetMarketplaceAgentsFromManifest,
  fetchMarketplaceManifest: mockFetchMarketplaceManifest,
}));

const {
  getAllMarketplaceServices,
  getAllMarketplaceAgents,
  getMarketplaceItem,
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

    it('returns null when manifest unavailable', async () => {
      mockGetMarketplaceServicesFromManifest.mockResolvedValue(null);

      const result = await getAllMarketplaceServices();

      expect(result).toBeNull();
    });

  });

  describe('getMarketplaceItem', () => {
    it('returns service by path from manifest', async () => {
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

      const result = await getMarketplaceItem('marketplace/services/test-service');

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

      const result = await getMarketplaceItem('marketplace/services/non-existent');

      expect(result).toBeUndefined();
    });

    it('returns null when marketplace unavailable', async () => {
      mockGetMarketplaceServicesFromManifest.mockResolvedValue(null);

      const result = await getMarketplaceItem('marketplace/services/phoenix');

      expect(result).toBeNull();
    });
  });
});

