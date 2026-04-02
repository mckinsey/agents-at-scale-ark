import {vi} from 'vitest';
import type {ServiceCollection} from './types/arkService.js';
import type {AnthropicMarketplaceManifest} from './types/marketplace.js';

const mockGetMarketplaceServicesFromManifest =
  vi.fn<() => Promise<ServiceCollection | null>>();
const mockGetMarketplaceAgentsFromManifest =
  vi.fn<() => Promise<ServiceCollection | null>>();
const mockGetMarketplaceExecutorsFromManifest =
  vi.fn<() => Promise<ServiceCollection | null>>();
const mockFetchMarketplaceManifest =
  vi.fn<() => Promise<AnthropicMarketplaceManifest | null>>();

vi.mock('./lib/marketplaceFetcher.js', () => ({
  getMarketplaceServicesFromManifest: mockGetMarketplaceServicesFromManifest,
  getMarketplaceAgentsFromManifest: mockGetMarketplaceAgentsFromManifest,
  getMarketplaceExecutorsFromManifest: mockGetMarketplaceExecutorsFromManifest,
  fetchMarketplaceManifest: mockFetchMarketplaceManifest,
}));

const {getAllMarketplaceServices, getAllMarketplaceExecutors, getMarketplaceItem} = await import(
  './marketplaceServices.js'
);

describe('marketplaceServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMarketplaceServicesFromManifest.mockClear();
    mockGetMarketplaceExecutorsFromManifest.mockClear();
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

  describe('getAllMarketplaceExecutors', () => {
    it('returns manifest executors when available', async () => {
      const mockExecutors = {
        'langchain': {
          name: 'langchain',
          helmReleaseName: 'langchain',
          description: 'LangChain executor',
          enabled: true,
          category: 'marketplace',
          namespace: 'langchain-ns',
        },
      };

      mockGetMarketplaceExecutorsFromManifest.mockResolvedValue(mockExecutors);

      const result = await getAllMarketplaceExecutors();

      expect(result).toEqual(mockExecutors);
      expect(mockGetMarketplaceExecutorsFromManifest).toHaveBeenCalled();
    });

    it('returns null when manifest unavailable', async () => {
      mockGetMarketplaceExecutorsFromManifest.mockResolvedValue(null);

      const result = await getAllMarketplaceExecutors();

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

      const result = await getMarketplaceItem(
        'marketplace/services/test-service'
      );

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

      const result = await getMarketplaceItem(
        'marketplace/services/non-existent'
      );

      expect(result).toBeUndefined();
    });

    it('returns null when marketplace unavailable', async () => {
      mockGetMarketplaceServicesFromManifest.mockResolvedValue(null);

      const result = await getMarketplaceItem('marketplace/services/phoenix');

      expect(result).toBeNull();
    });

    it('returns executor by path from manifest', async () => {
      const mockExecutors = {
        'langchain': {
          name: 'langchain',
          helmReleaseName: 'langchain',
          description: 'LangChain executor',
          enabled: true,
          category: 'marketplace',
        },
      };

      mockGetMarketplaceExecutorsFromManifest.mockResolvedValue(mockExecutors);

      const result = await getMarketplaceItem(
        'marketplace/executors/langchain'
      );

      expect(result).toEqual(mockExecutors['langchain']);
    });

    it('returns null when executor marketplace unavailable', async () => {
      mockGetMarketplaceExecutorsFromManifest.mockResolvedValue(null);

      const result = await getMarketplaceItem('marketplace/executors/langchain');

      expect(result).toBeNull();
    });
  });
});
