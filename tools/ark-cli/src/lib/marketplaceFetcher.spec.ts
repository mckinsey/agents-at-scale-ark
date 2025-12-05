import {jest} from '@jest/globals';
import type {AnthropicMarketplaceManifest} from '../types/marketplace.js';
import type {AxiosResponse, AxiosRequestConfig} from 'axios';

const mockAxiosGet = jest.fn<
  (
    url: string,
    config?: AxiosRequestConfig
  ) => Promise<AxiosResponse<AnthropicMarketplaceManifest>>
>();
jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
    isAxiosError: (error: unknown) => {
      return (
        typeof error === 'object' &&
        error !== null &&
        'isAxiosError' in error &&
        error.isAxiosError === true
      );
    },
  },
}));

const mockGetMarketplaceRepoUrl = jest.fn();
const mockGetMarketplaceRegistry = jest.fn();

jest.unstable_mockModule('./config.js', () => ({
  getMarketplaceRepoUrl: mockGetMarketplaceRepoUrl,
  getMarketplaceRegistry: mockGetMarketplaceRegistry,
}));

const {
  fetchMarketplaceManifest,
  mapMarketplaceItemToArkService,
  getMarketplaceServicesFromManifest,
} = await import('./marketplaceFetcher.js');

describe('marketplaceFetcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockClear();
    mockGetMarketplaceRepoUrl.mockReturnValue(
      'https://test-repo.example.com/marketplace'
    );
    mockGetMarketplaceRegistry.mockReturnValue(
      'oci://test-registry.example.com/charts'
    );
  });

  describe('fetchMarketplaceManifest', () => {
    it('fetches and returns manifest successfully', async () => {
      const mockManifest: AnthropicMarketplaceManifest = {
        version: '1.0.0',
        marketplace: 'ARK Marketplace',
        items: [
          {
            name: 'test-service',
            description: 'Test service',
            ark: {
              chartPath: 'oci://registry/test-service',
              namespace: 'test',
            },
          },
        ],
      };

      mockAxiosGet.mockResolvedValue({
        data: mockManifest,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await fetchMarketplaceManifest();

      expect(result).toEqual(mockManifest);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('marketplace.json'),
        expect.objectContaining({
          timeout: 10000,
          headers: {Accept: 'application/json'},
        })
      );
    });

    it('returns null on network error', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ENOTFOUND';
      (networkError as any).isAxiosError = true;

      mockAxiosGet.mockRejectedValue(networkError);

      const result = await fetchMarketplaceManifest();

      expect(result).toBeNull();
    });

    it('returns null on connection refused', async () => {
      const connectionError = Object.assign(new Error('Connection refused'), {
        code: 'ECONNREFUSED',
        isAxiosError: true,
      });

      mockAxiosGet.mockRejectedValue(connectionError);

      const result = await fetchMarketplaceManifest();

      expect(result).toBeNull();
    });

  });

  describe('mapMarketplaceItemToArkService', () => {
    it('maps marketplace item to ARK service correctly', () => {
      const item = {
        name: 'test-service',
        description: 'Test description',
        ark: {
          chartPath: 'oci://registry/test',
          namespace: 'test-ns',
          helmReleaseName: 'test-release',
          installArgs: ['--create-namespace'],
          k8sServiceName: 'test-svc',
          k8sServicePort: 8080,
          k8sDeploymentName: 'test-deploy',
        },
      };

      const result = mapMarketplaceItemToArkService(item);

      expect(result).toEqual({
        name: 'test-service',
        helmReleaseName: 'test-release',
        description: 'Test description',
        enabled: true,
        category: 'marketplace',
        namespace: 'test-ns',
        chartPath: 'oci://registry/test',
        installArgs: ['--create-namespace'],
        k8sServiceName: 'test-svc',
        k8sServicePort: 8080,
        k8sDeploymentName: 'test-deploy',
      });
    });

    it('uses defaults when ark fields are missing', () => {
      const item = {
        name: 'simple-service',
        description: 'Simple service',
        ark: {},
      };

      const result = mapMarketplaceItemToArkService(item);

      expect(result.name).toBe('simple-service');
      expect(result.helmReleaseName).toBe('simple-service');
      expect(result.namespace).toBe('simple-service');
      expect(result.chartPath).toContain('simple-service');
    });

    it('sanitizes service name', () => {
      const item = {
        name: 'Test Service 123!',
        description: 'Test',
        ark: {},
      };

      const result = mapMarketplaceItemToArkService(item);

      expect(result.name).toBe('test-service-123');
    });
  });

  describe('getMarketplaceServicesFromManifest', () => {
    it('converts manifest items to service collection', async () => {
      const mockManifest: AnthropicMarketplaceManifest = {
        version: '1.0.0',
        marketplace: 'ARK Marketplace',
        items: [
          {
            name: 'service1',
            description: 'Service 1',
            type: 'service',
            ark: {
              chartPath: 'oci://registry/service1',
              namespace: 'ns1',
            },
          },
          {
            name: 'service2',
            description: 'Service 2',
            type: 'service',
            ark: {
              chartPath: 'oci://registry/service2',
              namespace: 'ns2',
            },
          },
        ],
      };

      mockAxiosGet.mockResolvedValue({
        data: mockManifest,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await getMarketplaceServicesFromManifest();

      expect(result).not.toBeNull();
      expect(result?.['service1']).toBeDefined();
      expect(result?.['service2']).toBeDefined();
      expect(result?.['service1']?.description).toBe('Service 1');
      expect(result?.['service2']?.description).toBe('Service 2');
    });

    it('filters out items without ark field', async () => {
      const mockManifest: AnthropicMarketplaceManifest = {
        version: '1.0.0',
        marketplace: 'ARK Marketplace',
        items: [
          {
            name: 'service1',
            description: 'Service 1',
            type: 'service',
            ark: {
              chartPath: 'oci://registry/service1',
            },
          },
          {
            name: 'service2',
            description: 'Service 2',
            type: 'service',
          },
        ],
      };

      mockAxiosGet.mockResolvedValue({
        data: mockManifest,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await getMarketplaceServicesFromManifest();

      expect(result).not.toBeNull();
      expect(result?.['service1']).toBeDefined();
      expect(result?.['service2']).toBeUndefined();
    });

    it('returns null when manifest fetch fails', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ENOTFOUND';
      (networkError as any).isAxiosError = true;

      mockAxiosGet.mockRejectedValue(networkError);

      const result = await getMarketplaceServicesFromManifest();

      expect(result).toBeNull();
    });

    it('returns null when manifest has no items', async () => {
      const mockManifest: AnthropicMarketplaceManifest = {
        version: '1.0.0',
        marketplace: 'ARK Marketplace',
        items: [],
      };

      mockAxiosGet.mockResolvedValue({
        data: mockManifest,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await getMarketplaceServicesFromManifest();

      expect(result).toBeNull();
    });
  });
});

