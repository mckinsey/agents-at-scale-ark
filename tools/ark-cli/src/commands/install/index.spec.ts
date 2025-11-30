import {jest} from '@jest/globals';
import {Command} from 'commander';

import {execa} from 'execa';
import {getClusterInfo} from '../../lib/cluster.js';
import {getInstallableServices} from '../../arkServices.js';
import output from '../../lib/output.js';
import {isMicroK8sInstalled, configureMicroK8s} from '../../lib/microk8s.js';
import {loadConfig} from '../../lib/config.js';
import inquirer from 'inquirer';

const mockExeca = jest.fn() as unknown as jest.MockedFunction<typeof execa>;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockGetClusterInfo = jest.fn() as jest.MockedFunction<
  typeof getClusterInfo
>;
jest.unstable_mockModule('../../lib/cluster.js', () => ({
  getClusterInfo: mockGetClusterInfo,
}));

const mockGetInstallableServices = jest.fn() as jest.MockedFunction<
  typeof getInstallableServices
>;
const mockArkServices = {};
const mockArkDependencies = {};
jest.unstable_mockModule('../../arkServices.js', () => ({
  getInstallableServices: mockGetInstallableServices,
  arkServices: mockArkServices,
  arkDependencies: mockArkDependencies,
}));

const mockOutput = {
  error: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
} as unknown as jest.Mocked<typeof output>;
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

const mockIsMicroK8sInstalled = jest.fn() as jest.MockedFunction<
  typeof isMicroK8sInstalled
>;
const mockConfigureMicroK8s = jest.fn() as jest.MockedFunction<
  typeof configureMicroK8s
>;
jest.unstable_mockModule('../../lib/microk8s.js', () => ({
  isMicroK8sInstalled: mockIsMicroK8sInstalled,
  configureMicroK8s: mockConfigureMicroK8s,
}));

const mockLoadConfig = jest.fn() as jest.MockedFunction<typeof loadConfig>;
jest.unstable_mockModule('../../lib/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

const mockInquirer = {
  prompt: jest.fn(),
  Separator: jest.fn(),
} as unknown as jest.Mocked<typeof inquirer>;
jest.unstable_mockModule('inquirer', () => ({
  default: mockInquirer,
}));

const mockIsMarketplaceService = jest.fn() as jest.Mock;
const mockExtractMarketplaceServiceName = jest.fn() as jest.Mock;
const mockGetMarketplaceService = jest.fn() as jest.Mock;
const mockGetAllMarketplaceServices = jest.fn() as jest.Mock;

jest.unstable_mockModule('../../marketplaceServices.js', () => ({
  isMarketplaceService: mockIsMarketplaceService,
  extractMarketplaceServiceName: mockExtractMarketplaceServiceName,
  getMarketplaceService: mockGetMarketplaceService,
  getAllMarketplaceServices: mockGetAllMarketplaceServices,
}));

const mockWaitForServicesReady = jest.fn() as jest.Mock;
jest.unstable_mockModule('../../lib/waitForReady.js', () => ({
  waitForServicesReady: mockWaitForServicesReady,
}));

const mockOra = jest.fn(() => ({
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn(),
  fail: jest.fn(),
  text: '',
}));
jest.unstable_mockModule('ora', () => ({
  default: mockOra,
}));

const {createInstallCommand, installArk} = await import('./index.js');

describe('install command', () => {
  const mockConfig = {
    clusterInfo: {
      context: 'test-cluster',
      type: 'microk8s',
      namespace: 'default',
    },
  } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    mockGetClusterInfo.mockResolvedValue({
      context: 'test-cluster',
      type: 'microk8s',
      namespace: 'default',
    });
    mockIsMicroK8sInstalled.mockResolvedValue(false);
    mockExeca.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    } as any);
    
    // Default marketplace mocks
    mockIsMarketplaceService.mockReturnValue(false);
    mockExtractMarketplaceServiceName.mockReturnValue('');
    mockGetMarketplaceService.mockReturnValue(undefined);
    mockGetAllMarketplaceServices.mockReturnValue({});
    
    // Default waitForReady mock
    (mockWaitForServicesReady as jest.Mock).mockReturnValue(Promise.resolve(true));
    
    // Restore mockExit
    mockExit.mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
  });

  it('creates command with correct structure', () => {
    const command = createInstallCommand(mockConfig);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('install');
  });

  it('installs single service with correct helm parameters', async () => {
    const mockService = {
      name: 'ark-api',
      helmReleaseName: 'ark-api',
      chartPath: './charts/ark-api',
      namespace: 'ark-system',
      installArgs: ['--set', 'image.tag=latest'],
      description: 'Ark API Service',
      enabled: true,
      category: 'core',
    };
    mockGetInstallableServices.mockReturnValue({
      'ark-api': mockService,
    });

    const command = createInstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'ark-api']);

    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      [
        'upgrade',
        '--install',
        'ark-api',
        './charts/ark-api',
        '--namespace',
        'ark-system',
        '--set',
        'image.tag=latest',
      ],
      {stdio: 'inherit'}
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'ark-api installed successfully'
    );
  });

  it('shows error when service not found', async () => {
    mockGetInstallableServices.mockReturnValue({
      'ark-api': {name: 'ark-api', description: 'Ark API', enabled: true, category: 'core', helmReleaseName: 'ark-api'} as any,
      'ark-controller': {name: 'ark-controller', description: 'Ark Controller', enabled: true, category: 'core', helmReleaseName: 'ark-controller'} as any,
    });

    const command = createInstallCommand(mockConfig);

    await expect(
      command.parseAsync(['node', 'test', 'invalid-service'])
    ).rejects.toThrow('process.exit called');
    expect(mockOutput.error).toHaveBeenCalledWith(
      "service 'invalid-service' not found"
    );
    expect(mockOutput.info).toHaveBeenCalledWith('available services:');
    expect(mockOutput.info).toHaveBeenCalledWith('  ark-api');
    expect(mockOutput.info).toHaveBeenCalledWith('  ark-controller');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles service without namespace (uses current context)', async () => {
    const mockService = {
      name: 'ark-dashboard',
      helmReleaseName: 'ark-dashboard',
      chartPath: './charts/ark-dashboard',
      // namespace is undefined - should use current context
      installArgs: ['--set', 'replicas=2'],
      description: 'Ark Dashboard',
      enabled: true,
      category: 'service',
    };
    mockGetInstallableServices.mockReturnValue({
      'ark-dashboard': mockService,
    });

    const command = createInstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'ark-dashboard']);

    // Should NOT include --namespace flag
    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      [
        'upgrade',
        '--install',
        'ark-dashboard',
        './charts/ark-dashboard',
        '--set',
        'replicas=2',
      ],
      {stdio: 'inherit'}
    );
  });

  it('handles service without installArgs', async () => {
    const mockService = {
      name: 'simple-service',
      helmReleaseName: 'simple-service',
      chartPath: './charts/simple',
      namespace: 'default',
      description: 'Simple Service',
      enabled: true,
      category: 'service',
    };
    mockGetInstallableServices.mockReturnValue({
      'simple-service': mockService,
    });

    const command = createInstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'simple-service']);

    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      [
        'upgrade',
        '--install',
        'simple-service',
        './charts/simple',
        '--namespace',
        'default',
      ],
      {stdio: 'inherit'}
    );
  });

  it('exits when cluster not connected and microk8s not installed', async () => {
    mockGetClusterInfo.mockResolvedValue({error: true} as any);
    mockIsMicroK8sInstalled.mockResolvedValue(false);

    const command = createInstallCommand({});

    await expect(
      command.parseAsync(['node', 'test', 'ark-api'])
    ).rejects.toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockIsMicroK8sInstalled).toHaveBeenCalled();
  });

  it('configures microk8s when no cluster connected and microk8s installed', async () => {
    mockIsMicroK8sInstalled.mockResolvedValue(true);
    mockConfigureMicroK8s.mockResolvedValue(undefined);
    mockLoadConfig.mockReturnValue({
      clusterInfo: {
        context: 'microk8s',
        type: 'microk8s',
        namespace: 'default',
      },
    });
    mockInquirer.prompt.mockResolvedValue({
      configure: true,
    });

    // We need to mock getInstallableServices to return something so it doesn't fail later
    mockGetInstallableServices.mockReturnValue({
      'ark-api': {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: './charts/ark-api',
        description: 'Ark API',
        enabled: true,
        category: 'core',
      },
    });

    const command = createInstallCommand({});
    await command.parseAsync(['node', 'test', 'ark-api']);

    expect(mockIsMicroK8sInstalled).toHaveBeenCalled();
    expect(mockInquirer.prompt).toHaveBeenCalled();
    expect(mockConfigureMicroK8s).toHaveBeenCalled();
    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockOutput.success).toHaveBeenCalledWith(
      'ark-api installed successfully'
    );
  });
  it('should handle prompt cancellation (Ctrl-C)', async () => {
    mockLoadConfig.mockReturnValue({clusterInfo: {type: 'microk8s', context: 'microk8s'}});
    
    const error = new Error('ExitPromptError');
    error.name = 'ExitPromptError';
    mockInquirer.prompt.mockRejectedValue(error);

    await expect(installArk(mockLoadConfig())).rejects.toThrow('process.exit called');
    
    expect(mockExit).toHaveBeenCalledWith(130);
  });

  it('should handle installation errors for specific service', async () => {
    mockLoadConfig.mockReturnValue({clusterInfo: {type: 'microk8s', context: 'microk8s'}});
    mockGetInstallableServices.mockReturnValue({
      'ark-api': {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: './charts/ark-api',
        description: 'Ark API',
        enabled: true,
        category: 'core',
      },
    });
    mockExeca.mockRejectedValue(new Error('Install failed'));

    await expect(installArk(mockLoadConfig(), 'ark-api')).rejects.toThrow('process.exit called');
    
    expect(mockOutput.error).toHaveBeenCalledWith(expect.stringContaining('failed to install ark-api'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should install marketplace service', async () => {
    mockIsMarketplaceService.mockReturnValue(true);
    mockExtractMarketplaceServiceName.mockReturnValue('test-service');
    mockGetMarketplaceService.mockReturnValue({
      name: 'test-service',
      helmReleaseName: 'test-service',
      chartPath: './charts/test-service',
      namespace: 'ark-system',
    });

    const command = createInstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'marketplace/services/test-service']);

    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      expect.arrayContaining(['upgrade', '--install', 'test-service']),
      expect.anything()
    );
    expect(mockOutput.success).toHaveBeenCalledWith('test-service installed successfully');
  });

  it('should show error for invalid marketplace service', async () => {
    mockIsMarketplaceService.mockReturnValue(true);
    mockExtractMarketplaceServiceName.mockReturnValue('invalid-service');
    mockGetMarketplaceService.mockReturnValue(undefined);
    mockGetAllMarketplaceServices.mockReturnValue({});

    const command = createInstallCommand(mockConfig);
    await expect(command.parseAsync(['node', 'test', 'marketplace/services/invalid-service'])).rejects.toThrow('process.exit called');

    expect(mockOutput.error).toHaveBeenCalledWith("marketplace service 'invalid-service' not found");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should install selected components interactively', async () => {
    mockInquirer.prompt.mockResolvedValue({
      components: ['cert-manager', 'ark-api'],
    });
    
    // Mock dependencies
    (mockArkDependencies as any)['cert-manager'] = {
      name: 'cert-manager',
      command: 'helm',
      args: ['install', 'cert-manager'],
    };
    (mockArkDependencies as any)['cert-manager-repo'] = {
      name: 'cert-manager-repo',
      command: 'helm',
      args: ['repo', 'add'],
    };
    (mockArkDependencies as any)['helm-repo-update'] = {
      name: 'helm-repo-update',
      command: 'helm',
      args: ['repo', 'update'],
    };

    // Mock services
    (mockArkServices as any)['ark-api'] = {
      name: 'ark-api',
      helmReleaseName: 'ark-api',
      chartPath: './charts/ark-api',
      category: 'core',
      enabled: true,
    };

    const command = createInstallCommand(mockConfig);
    await command.parseAsync(['node', 'test']);

    // Should install dependencies
    expect(mockExeca).toHaveBeenCalledWith('helm', ['repo', 'add'], expect.anything());
    expect(mockExeca).toHaveBeenCalledWith('helm', ['install', 'cert-manager'], expect.anything());
    
    // Should install selected service
    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      expect.arrayContaining(['upgrade', '--install', 'ark-api']),
      expect.anything()
    );
  });
});
