import {jest} from '@jest/globals';
import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import type {ServiceCollection} from '../../types/arkService.js';
import type {AnthropicMarketplaceManifest} from '../../types/marketplace.js';

const mockGetAllMarketplaceServices = jest.fn<
  (forceRefresh?: boolean) => Promise<ServiceCollection>
>();
const mockFetchMarketplaceManifest = jest.fn<
  (forceRefresh?: boolean) => Promise<AnthropicMarketplaceManifest | null>
>();
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

jest.unstable_mockModule('../../marketplaceServices.js', () => ({
  getAllMarketplaceServices: mockGetAllMarketplaceServices,
}));

jest.unstable_mockModule('../../lib/marketplaceFetcher.js', () => ({
  fetchMarketplaceManifest: mockFetchMarketplaceManifest,
}));

const {createMarketplaceCommand} = await import('./index.js');

describe('marketplace command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates marketplace command with correct structure', () => {
    const command = createMarketplaceCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('marketplace');
  });

  it('lists services from manifest', async () => {
    const mockServices = {
      'test-service': {
        name: 'test-service',
        helmReleaseName: 'test-service',
        description: 'Test service description',
        enabled: true,
        category: 'marketplace',
        namespace: 'test-ns',
      },
    };

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

    mockGetAllMarketplaceServices.mockResolvedValue(mockServices);
    mockFetchMarketplaceManifest.mockResolvedValue(mockManifest);

    const command = createMarketplaceCommand({} as ArkConfig);
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockGetAllMarketplaceServices).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalled();
  });

  it('shows fallback message when manifest unavailable', async () => {
    const mockServices = {
      phoenix: {
        name: 'phoenix',
        helmReleaseName: 'phoenix',
        description: 'Phoenix service',
        enabled: true,
        category: 'marketplace',
        namespace: 'phoenix',
      },
    };

    mockGetAllMarketplaceServices.mockResolvedValue(mockServices);
    mockFetchMarketplaceManifest.mockResolvedValue(null);

    const command = createMarketplaceCommand({} as ArkConfig);
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockConsoleLog).toHaveBeenCalled();
    const logCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join(' ');
    expect(logCalls).toContain('fallback');
  });

  it('forces refresh when --refresh flag is used', async () => {
    const mockServices = {
      'refreshed-service': {
        name: 'refreshed-service',
        helmReleaseName: 'refreshed-service',
        description: 'Refreshed',
        enabled: true,
        category: 'marketplace',
        namespace: 'refreshed',
      },
    };

    mockGetAllMarketplaceServices.mockResolvedValue(mockServices);
    mockFetchMarketplaceManifest.mockResolvedValue(null);

    const command = createMarketplaceCommand({} as ArkConfig);
    await command.parseAsync(['node', 'test', 'list', '--refresh']);

    expect(mockGetAllMarketplaceServices).toHaveBeenCalledWith(true);
    expect(mockFetchMarketplaceManifest).toHaveBeenCalledWith(true);
  });
});

