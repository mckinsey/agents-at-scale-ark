import {jest} from '@jest/globals';
import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import type {ServiceCollection} from '../../types/arkService.js';
import type {AnthropicMarketplaceManifest} from '../../types/marketplace.js';

const mockGetAllMarketplaceServices = jest.fn<
  () => Promise<ServiceCollection | null>
>();
const mockGetAllMarketplaceAgents = jest.fn<
  () => Promise<ServiceCollection | null>
>();
const mockFetchMarketplaceManifest = jest.fn<
  () => Promise<AnthropicMarketplaceManifest | null>
>();
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

jest.unstable_mockModule('../../marketplaceServices.js', () => ({
  getAllMarketplaceServices: mockGetAllMarketplaceServices,
  getAllMarketplaceAgents: mockGetAllMarketplaceAgents,
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

  it('lists services and agents from manifest', async () => {
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

    const mockAgents = {
      'test-agent': {
        name: 'test-agent',
        helmReleaseName: 'test-agent',
        description: 'Test agent description',
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
          type: 'service',
          ark: {
            chartPath: 'oci://registry/test-service',
            namespace: 'test',
          },
        },
        {
          name: 'test-agent',
          description: 'Test agent',
          type: 'agent',
          ark: {
            chartPath: 'oci://registry/test-agent',
            namespace: 'test',
          },
        },
      ],
    };

    mockGetAllMarketplaceServices.mockResolvedValue(mockServices);
    mockGetAllMarketplaceAgents.mockResolvedValue(mockAgents);
    mockFetchMarketplaceManifest.mockResolvedValue(mockManifest);

    const command = createMarketplaceCommand({} as ArkConfig);
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockGetAllMarketplaceServices).toHaveBeenCalled();
    expect(mockGetAllMarketplaceAgents).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalled();
  });

  it('shows unavailable message when marketplace unavailable', async () => {
    mockGetAllMarketplaceServices.mockResolvedValue(null);
    mockGetAllMarketplaceAgents.mockResolvedValue(null);
    mockFetchMarketplaceManifest.mockResolvedValue(null);

    const command = createMarketplaceCommand({} as ArkConfig);
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockConsoleLog).toHaveBeenCalled();
    const logCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join(' ');
    expect(logCalls).toContain('unavailable');
  });

});

