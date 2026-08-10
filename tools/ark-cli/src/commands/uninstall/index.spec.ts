import {vi} from 'vitest';
import {Command} from 'commander';

const mockExeca = vi.fn(() => Promise.resolve()) as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockPrompt = vi.fn();
vi.mock('inquirer', () => ({
  default: {prompt: mockPrompt},
}));

const mockGetClusterInfo = vi.fn() as any;
vi.mock('../../lib/cluster.js', () => ({
  getClusterInfo: mockGetClusterInfo,
}));

const mockGetInstallableServices = vi.fn() as any;
const mockArkServices = {};
vi.mock('../../arkServices.js', () => ({
  getInstallableServices: mockGetInstallableServices,
  arkServices: mockArkServices,
}));

const mockIsMarketplaceService = vi.fn();
const mockGetMarketplaceItem = vi.fn();
const mockGetAllMarketplaceServices = vi.fn();
const mockGetAllMarketplaceAgents = vi.fn();
const mockGetAllMarketplaceExecutors = vi.fn();
vi.mock('../../marketplaceServices.js', () => ({
  isMarketplaceService: mockIsMarketplaceService,
  getMarketplaceItem: mockGetMarketplaceItem,
  getAllMarketplaceServices: mockGetAllMarketplaceServices,
  getAllMarketplaceAgents: mockGetAllMarketplaceAgents,
  getAllMarketplaceExecutors: mockGetAllMarketplaceExecutors,
}));

const mockOutput = {
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
};
vi.mock('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const {createUninstallCommand} = await import('./index.js');

describe('uninstall command', () => {
  const mockConfig = {
    clusterInfo: {
      context: 'test-cluster',
      type: 'minikube',
      namespace: 'default',
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClusterInfo.mockResolvedValue({
      context: 'test-cluster',
      type: 'minikube',
      namespace: 'default',
    });
    mockIsMarketplaceService.mockReturnValue(false);
  });

  it('creates command with correct structure', () => {
    const command = createUninstallCommand(mockConfig);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('uninstall');
  });

  it('uninstalls single service with correct helm parameters', async () => {
    const mockService = {
      name: 'ark-api',
      helmReleaseName: 'ark-api',
      namespace: 'ark-system',
    };
    mockGetInstallableServices.mockReturnValue({
      'ark-api': mockService,
    });

    const command = createUninstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'ark-api']);

    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      [
        'uninstall',
        'ark-api',
        '--ignore-not-found',
        '--namespace',
        'ark-system',
      ],
      {
        stdio: 'inherit',
      }
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'ark-api uninstalled successfully'
    );
  });

  it('uninstalls multiple services sequentially', async () => {
    const mockServices = {
      'ark-api': {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        namespace: 'ark-system',
      },
      'ark-dashboard': {
        name: 'ark-dashboard',
        helmReleaseName: 'ark-dashboard',
        namespace: 'ark-system',
      },
    };
    mockGetInstallableServices.mockReturnValue(mockServices);
    mockExeca.mockResolvedValue({stdout: ''});

    const command = createUninstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'ark-api', 'ark-dashboard']);

    expect(mockOutput.success).toHaveBeenCalledWith('ark-api uninstalled successfully');
    expect(mockOutput.success).toHaveBeenCalledWith('ark-dashboard uninstalled successfully');
  });

  it('shows error when service not found', async () => {
    mockGetInstallableServices.mockReturnValue({
      'ark-api': {name: 'ark-api'},
      'ark-controller': {name: 'ark-controller'},
    });

    const command = createUninstallCommand(mockConfig);

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
      // namespace is undefined - should use current context
    };
    mockGetInstallableServices.mockReturnValue({
      'ark-dashboard': mockService,
    });

    const command = createUninstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'ark-dashboard']);

    // Should NOT include --namespace flag
    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      ['uninstall', 'ark-dashboard', '--ignore-not-found'],
      {
        stdio: 'inherit',
      }
    );
  });

  it('handles helm uninstall error gracefully', async () => {
    const mockService = {
      name: 'ark-api',
      helmReleaseName: 'ark-api',
      namespace: 'ark-system',
    };
    mockGetInstallableServices.mockReturnValue({
      'ark-api': mockService,
    });
    mockExeca.mockRejectedValue(new Error('helm failed'));

    const command = createUninstallCommand(mockConfig);

    await expect(
      command.parseAsync(['node', 'test', 'ark-api'])
    ).rejects.toThrow('process.exit called');
    expect(mockOutput.error).toHaveBeenCalledWith(
      'failed to uninstall ark-api'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits when cluster not connected', async () => {
    mockGetClusterInfo.mockResolvedValue({error: true});

    const command = createUninstallCommand({});

    await expect(
      command.parseAsync(['node', 'test', 'ark-api'])
    ).rejects.toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles verbose option', async () => {
    const mockService = {
      name: 'ark-dashboard',
      helmReleaseName: 'ark-dashboard',
      namespace: 'ark-system',
    };
    mockGetInstallableServices.mockReturnValue({
      'ark-dashboard': mockService,
    });
    mockExeca.mockResolvedValue({stdout: ''});

    const command = createUninstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'ark-dashboard', '--verbose']);

    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      [
        'uninstall',
        'ark-dashboard',
        '--ignore-not-found',
        '--namespace',
        'ark-system',
      ],
      {
        stdio: 'inherit',
      }
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'ark-dashboard uninstalled successfully'
    );
  });

  it('shows error when marketplace item not found', async () => {
    mockIsMarketplaceService.mockReturnValue(true);
    mockGetMarketplaceItem.mockResolvedValue(null);
    mockGetAllMarketplaceServices.mockResolvedValue({
      phoenix: {name: 'phoenix'},
    });
    mockGetAllMarketplaceAgents.mockResolvedValue(null);
    mockGetAllMarketplaceExecutors.mockResolvedValue(null);

    const command = createUninstallCommand(mockConfig);

    await expect(
      command.parseAsync(['node', 'test', 'marketplace/services/nonexistent'])
    ).rejects.toThrow('process.exit called');
    expect(mockOutput.error).toHaveBeenCalledWith(
      "marketplace item 'marketplace/services/nonexistent' not found"
    );
    expect(mockOutput.info).toHaveBeenCalledWith('available marketplace items:');
    expect(mockOutput.info).toHaveBeenCalledWith('  marketplace/services/phoenix');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('uninstalls marketplace service successfully', async () => {
    const mockMarketplaceService = {
      name: 'phoenix',
      helmReleaseName: 'phoenix',
      namespace: 'observability',
    };
    mockIsMarketplaceService.mockReturnValue(true);
    mockGetMarketplaceItem.mockResolvedValue(mockMarketplaceService);
    mockExeca.mockResolvedValue({stdout: ''});

    const command = createUninstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'marketplace/services/phoenix']);

    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      [
        'uninstall',
        'phoenix',
        '--ignore-not-found',
        '--namespace',
        'observability',
      ],
      {
        stdio: 'inherit',
      }
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'phoenix uninstalled successfully'
    );
  });

  describe('interactive uninstall', () => {
    it('prompts for each service when no service name provided', async () => {
      mockGetInstallableServices.mockReturnValue({
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          namespace: 'ark-system',
        },
        'ark-controller': {
          name: 'ark-controller',
          helmReleaseName: 'ark-controller',
          namespace: 'ark-system',
        },
      });
      mockPrompt.mockResolvedValue({shouldUninstall: true});

      const command = createUninstallCommand(mockConfig);
      await command.parseAsync(['node', 'test']);

      expect(mockPrompt).toHaveBeenCalled();
      expect(mockExeca).toHaveBeenCalled();
    });

    it('skips service when user declines', async () => {
      mockGetInstallableServices.mockReturnValue({
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          namespace: 'ark-system',
        },
      });
      mockPrompt.mockResolvedValue({shouldUninstall: false});

      const command = createUninstallCommand(mockConfig);
      await command.parseAsync(['node', 'test']);

      expect(mockOutput.warning).toHaveBeenCalledWith('skipping ark-api');
    });

    it('handles Ctrl-C gracefully', async () => {
      mockGetInstallableServices.mockReturnValue({
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          namespace: 'ark-system',
        },
      });
      const exitError = new Error('User cancelled');
      (exitError as any).name = 'ExitPromptError';
      mockPrompt.mockRejectedValue(exitError);

      const command = createUninstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test'])
      ).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(130);
    });

    it('rethrows non-ExitPromptError errors', async () => {
      mockGetInstallableServices.mockReturnValue({
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          namespace: 'ark-system',
        },
      });
      mockPrompt.mockRejectedValue(new Error('Unexpected error'));

      const command = createUninstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test'])
      ).rejects.toThrow('Unexpected error');
    });

    it('continues on uninstall error', async () => {
      mockGetInstallableServices.mockReturnValue({
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          namespace: 'ark-system',
        },
        'ark-controller': {
          name: 'ark-controller',
          helmReleaseName: 'ark-controller',
          namespace: 'ark-system',
        },
      });
      mockPrompt.mockResolvedValue({shouldUninstall: true});
      mockExeca
        .mockRejectedValueOnce(new Error('uninstall failed'))
        .mockResolvedValueOnce({});

      const command = createUninstallCommand(mockConfig);
      await command.parseAsync(['node', 'test']);

      expect(mockExeca).toHaveBeenCalledTimes(2);
    });
  });
});
