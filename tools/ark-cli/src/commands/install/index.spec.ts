import {vi} from 'vitest';
import {Command} from 'commander';

const mockExeca = vi.fn(() => Promise.resolve()) as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockPrompt = vi.fn();
vi.mock('inquirer', () => ({
  default: {
    prompt: mockPrompt,
    Separator: vi.fn().mockImplementation((text) => ({type: 'separator', line: text})),
  },
}));

const mockGetClusterInfo = vi.fn() as any;
vi.mock('../../lib/cluster.js', () => ({
  getClusterInfo: mockGetClusterInfo,
}));

const mockGetInstallableServices = vi.fn() as any;
const mockArkServices = {};
const mockArkDependencies = {};
vi.mock('../../arkServices.js', () => ({
  getInstallableServices: mockGetInstallableServices,
  arkServices: mockArkServices,
  arkDependencies: mockArkDependencies,
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

const mockRunReadinessChecks = vi.fn();
vi.mock('../../lib/readinessChecks.js', () => ({
  runReadinessChecks: mockRunReadinessChecks,
}));

const {createInstallCommand} = await import('./index.js');

describe('install command', () => {
  const mockConfig = {
    clusterInfo: {
      context: 'test-cluster',
      type: 'minikube',
      namespace: 'default',
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockArkServices)) {
      delete (mockArkServices as any)[key];
    }
    for (const key of Object.keys(mockArkDependencies)) {
      delete (mockArkDependencies as any)[key];
    }
    mockGetClusterInfo.mockResolvedValue({
      context: 'test-cluster',
      type: 'minikube',
      namespace: 'default',
    });
    mockIsMarketplaceService.mockReturnValue(false);
    // Mock successful readiness checks by default
    mockRunReadinessChecks.mockResolvedValue([
      {name: 'APIServices available', passed: true, durationMs: 100},
      {name: 'API group registered', passed: true, durationMs: 100},
    ]);
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
      {
        stdout: 'inherit',
        stderr: 'pipe',
      }
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'ark-api installed successfully'
    );
  });

  it('installs multiple services sequentially', async () => {
    const mockServices = {
      'ark-api': {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: './charts/ark-api',
        namespace: 'ark-system',
      },
      'ark-dashboard': {
        name: 'ark-dashboard',
        helmReleaseName: 'ark-dashboard',
        chartPath: './charts/ark-dashboard',
        namespace: 'ark-system',
      },
    };
    mockGetInstallableServices.mockReturnValue(mockServices);
    mockExeca.mockResolvedValue({stdout: ''});

    const command = createInstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'ark-api', 'ark-dashboard']);

    expect(mockOutput.success).toHaveBeenCalledWith('ark-api installed successfully');
    expect(mockOutput.success).toHaveBeenCalledWith('ark-dashboard installed successfully');
  });

  it('shows error when service not found', async () => {
    mockGetInstallableServices.mockReturnValue({
      'ark-api': {name: 'ark-api'},
      'ark-controller': {name: 'ark-controller'},
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
      {
        stdout: 'inherit',
        stderr: 'pipe',
      }
    );
  });

  it('handles service without installArgs', async () => {
    const mockService = {
      name: 'simple-service',
      helmReleaseName: 'simple-service',
      chartPath: './charts/simple',
      namespace: 'default',
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
      {
        stdout: 'inherit',
        stderr: 'pipe',
      }
    );
  });

  it('uninstalls prerequisites before installing service', async () => {
    const mockService = {
      name: 'ark-api',
      helmReleaseName: 'ark-api',
      chartPath: './charts/ark-api',
      namespace: 'ark-system',
      prerequisiteUninstalls: [
        {releaseName: 'old-release', namespace: 'ark-system'},
      ],
    };
    mockGetInstallableServices.mockReturnValue({
      'ark-api': mockService,
    });
    mockExeca.mockResolvedValue({stdout: ''});

    const command = createInstallCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'ark-api']);

    expect(mockExeca).toHaveBeenCalledWith(
      'helm',
      ['uninstall', 'old-release', '--ignore-not-found', '--namespace', 'ark-system'],
      {stdio: 'inherit'}
    );
  });

  it('exits when cluster not connected', async () => {
    mockGetClusterInfo.mockResolvedValue({error: true});

    const command = createInstallCommand({});

    await expect(
      command.parseAsync(['node', 'test', 'ark-api'])
    ).rejects.toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('shows error when marketplace item not found', async () => {
    mockIsMarketplaceService.mockReturnValue(true);
    mockGetMarketplaceItem.mockResolvedValue(null);
    mockGetAllMarketplaceServices.mockResolvedValue({
      phoenix: {name: 'phoenix'},
    });
    mockGetAllMarketplaceAgents.mockResolvedValue(null);
    mockGetAllMarketplaceExecutors.mockResolvedValue(null);

    const command = createInstallCommand(mockConfig);

    await expect(
      command.parseAsync(['node', 'test', 'marketplace/services/nonexistent'])
    ).rejects.toThrow('process.exit called');
    expect(mockOutput.error).toHaveBeenCalledWith(
      "marketplace item 'marketplace/services/nonexistent' not found"
    );
    expect(mockOutput.info).toHaveBeenCalledWith('available marketplace items:');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  describe('checkAndCleanFailedRelease', () => {
    it('uninstalls release in pending-install state', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: './charts/ark-api',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-api': mockService,
      });

      mockExeca
        .mockResolvedValueOnce({
          stdout: 'NAME: ark-api\nSTATUS: pending-install\n',
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-api']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        ['status', 'ark-api', '--namespace', 'ark-system'],
        {}
      );
      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        ['uninstall', 'ark-api', '--namespace', 'ark-system'],
        {stdio: 'inherit'}
      );
      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        [
          'upgrade',
          '--install',
          'ark-api',
          './charts/ark-api',
          '--namespace',
          'ark-system',
        ],
        {
          stdout: 'inherit',
          stderr: 'pipe',
        }
      );
    });

    it('uninstalls release in failed state', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: './charts/ark-api',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-api': mockService,
      });

      mockExeca
        .mockResolvedValueOnce({
          stdout: 'NAME: ark-api\nSTATUS: failed\n',
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-api']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        ['uninstall', 'ark-api', '--namespace', 'ark-system'],
        {stdio: 'inherit'}
      );
    });

    it('uninstalls release in uninstalling state', async () => {
      const mockService = {
        name: 'ark-dashboard',
        helmReleaseName: 'ark-dashboard',
        chartPath: './charts/ark-dashboard',
        namespace: 'default',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-dashboard': mockService,
      });

      mockExeca
        .mockResolvedValueOnce({
          stdout: 'NAME: ark-dashboard\nSTATUS: uninstalling\nREVISION: 2\n',
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-dashboard']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        ['uninstall', 'ark-dashboard', '--namespace', 'default'],
        {stdio: 'inherit'}
      );
    });

    it('does not uninstall release in deployed state', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: './charts/ark-api',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-api': mockService,
      });

      mockExeca
        .mockResolvedValueOnce({
          stdout: 'NAME: ark-api\nSTATUS: deployed\n',
        })
        .mockResolvedValueOnce({});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-api']);

      const uninstallCalls = mockExeca.mock.calls.filter(
        (call: any) => call[0] === 'helm' && call[1][0] === 'uninstall'
      );
      expect(uninstallCalls).toHaveLength(0);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        [
          'upgrade',
          '--install',
          'ark-api',
          './charts/ark-api',
          '--namespace',
          'ark-system',
        ],
        {
          stdout: 'inherit',
          stderr: 'pipe',
        }
      );
    });

    it('handles helm status errors gracefully', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: './charts/ark-api',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-api': mockService,
      });

      mockExeca
        .mockRejectedValueOnce(new Error('release not found'))
        .mockResolvedValueOnce({});

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
        ],
        {
          stdout: 'inherit',
          stderr: 'pipe',
        }
      );
    });

    it('errors when --wait-for-ready used without -y flag', async () => {
      const command = createInstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test', '--wait-for-ready', '30s'])
      ).rejects.toThrow('process.exit called');
      expect(mockOutput.error).toHaveBeenCalledWith(
        '--wait-for-ready requires -y flag for non-interactive mode'
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('handles install failure for single service', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: './charts/ark-api',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-api': mockService,
      });

      mockExeca
        .mockResolvedValueOnce({stdout: ''})
        .mockRejectedValueOnce(new Error('helm upgrade failed'));

      const command = createInstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test', 'ark-api'])
      ).rejects.toThrow('process.exit called');
      expect(mockOutput.error).toHaveBeenCalledWith('failed to install ark-api');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('handles service without namespace', async () => {
      const mockService = {
        name: 'ark-dashboard',
        helmReleaseName: 'ark-dashboard',
        chartPath: './charts/ark-dashboard',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-dashboard': mockService,
      });

      mockExeca
        .mockResolvedValueOnce({
          stdout: 'NAME: ark-dashboard\nSTATUS: failed\n',
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-dashboard']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        ['status', 'ark-dashboard'],
        {}
      );
      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        ['uninstall', 'ark-dashboard'],
        {stdio: 'inherit'}
      );
    });
  });

  describe('interactive install', () => {
    const setupInteractiveMocks = () => {
      Object.assign(mockArkServices, {
        'ark-controller': {
          name: 'ark-controller',
          helmReleaseName: 'ark-controller',
          chartPath: './charts/ark-controller',
          namespace: 'ark-system',
          category: 'core',
          description: 'Core Ark controller',
          enabled: true,
          mandatory: true,
        },
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          chartPath: './charts/ark-api',
          namespace: 'ark-system',
          category: 'service',
          description: 'API service',
          enabled: true,
        },
      });
      Object.assign(mockArkDependencies, {
        'cert-manager-repo': {
          name: 'cert-manager-repo',
          command: 'helm',
          args: ['repo', 'add', 'jetstack', 'https://charts.jetstack.io'],
          description: 'Add Jetstack Helm repository',
        },
        'helm-repo-update': {
          name: 'helm-repo-update',
          command: 'helm',
          args: ['repo', 'update'],
          description: 'Update Helm repositories',
        },
        'cert-manager': {
          name: 'cert-manager',
          command: 'helm',
          args: ['upgrade', '--install', 'cert-manager', 'jetstack/cert-manager'],
          description: 'Certificate management',
        },
        'gateway-api-crds': {
          name: 'gateway-api-crds',
          command: 'kubectl',
          args: ['apply', '-f', 'https://example.com/gateway-api.yaml'],
          description: 'Gateway API CRDs',
        },
      });
      mockGetInstallableServices.mockReturnValue(mockArkServices);
    };

    it('prompts for components when no service name and no -y flag', async () => {
      setupInteractiveMocks();
      mockPrompt.mockResolvedValue({components: ['ark-api']});
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test']);

      expect(mockPrompt).toHaveBeenCalled();
    });

    it('installs mandatory components even when no optional components selected', async () => {
      setupInteractiveMocks();
      mockPrompt.mockResolvedValue({components: []});
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test']);

      expect(mockPrompt).toHaveBeenCalled();
      expect(mockExeca).toHaveBeenCalled();
    });

    it('handles Ctrl-C gracefully during component selection', async () => {
      setupInteractiveMocks();
      const exitError = new Error('User cancelled');
      (exitError as any).name = 'ExitPromptError';
      mockPrompt.mockRejectedValue(exitError);

      const command = createInstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test'])
      ).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(130);
    });
  });

  describe('version override flags', () => {
    it('replaces ARK service version with --ark-version flag', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:0.1.57',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-api': mockService,
      });
      mockExeca.mockResolvedValue({stdout: '', stderr: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-api', '--ark-version', '0.1.50']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        [
          'upgrade',
          '--install',
          'ark-api',
          'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:0.1.50',
          '--namespace',
          'ark-system',
        ],
        {
          stdout: 'inherit',
          stderr: 'pipe',
        }
      );
    });

    it('appends marketplace version with --marketplace-version flag', async () => {
      const mockService = {
        name: 'phoenix',
        helmReleaseName: 'phoenix',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix',
        namespace: 'default',
      };
      mockIsMarketplaceService.mockReturnValue(true);
      mockGetMarketplaceItem.mockResolvedValue(mockService);
      mockExeca
        .mockResolvedValueOnce({stdout: '', stderr: ''})  // for checkAndCleanFailedRelease
        .mockResolvedValueOnce({stdout: '', stderr: ''});  // for actual install

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'marketplace/services/phoenix', '--marketplace-version', '0.1.7']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        [
          'upgrade',
          '--install',
          'phoenix',
          'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix:0.1.7',
          '--namespace',
          'default',
        ],
        {
          stdout: 'inherit',
          stderr: 'pipe',
        }
      );
    });

    it('uses both --ark-version and --marketplace-version together', async () => {
      const arkService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:0.1.57',
        namespace: 'ark-system',
      };
      const marketplaceService = {
        name: 'phoenix',
        helmReleaseName: 'phoenix',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix',
        namespace: 'default',
      };

      mockGetInstallableServices.mockReturnValue({'ark-api': arkService});
      mockIsMarketplaceService.mockImplementation((name) => name === 'marketplace/services/phoenix');
      mockGetMarketplaceItem.mockResolvedValue(marketplaceService);
      mockExeca
        .mockResolvedValue({stdout: '', stderr: ''})  // for checkAndCleanFailedRelease calls
        .mockResolvedValue({stdout: '', stderr: ''})  // for ark-api install
        .mockResolvedValue({stdout: '', stderr: ''})  // for checkAndCleanFailedRelease
        .mockResolvedValue({stdout: '', stderr: ''});  // for phoenix install

      const command = createInstallCommand(mockConfig);
      await command.parseAsync([
        'node', 'test',
        'ark-api',
        'marketplace/services/phoenix',
        '--ark-version', '0.1.50',
        '--marketplace-version', '0.1.7'
      ]);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        expect.arrayContaining([
          'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:0.1.50',
        ]),
        expect.any(Object)
      );

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        expect.arrayContaining([
          'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix:0.1.7',
        ]),
        expect.any(Object)
      );
    });

    it('shows warning and continues when ARK version not found', async () => {
      const mockService = {
        name: 'ark-completions',
        helmReleaseName: 'ark-completions',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-completions:0.1.57',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-completions': mockService,
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:0.1.57',
          namespace: 'ark-system',
        },
      });

      mockExeca
        .mockResolvedValueOnce({stdout: '', stderr: ''})
        .mockRejectedValueOnce({
          stderr: 'Error: failed to perform "FetchReference" on source: ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-completions:0.1.50: not found',
          message: 'Command failed',
        })
        .mockResolvedValueOnce({stdout: '', stderr: ''})
        .mockResolvedValueOnce({stdout: '', stderr: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-completions', 'ark-api', '--ark-version', '0.1.50']);

      expect(mockOutput.warning).toHaveBeenCalledWith('ark-completions version 0.1.50 not found, skipping...');
      expect(mockOutput.success).toHaveBeenCalledWith('ark-api installed successfully');
    });

    it('shows warning and continues when marketplace version not found', async () => {
      const mockService = {
        name: 'phoenix',
        helmReleaseName: 'phoenix',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix',
        namespace: 'default',
      };
      mockIsMarketplaceService.mockReturnValue(true);
      mockGetMarketplaceItem.mockResolvedValue(mockService);

      mockExeca
        .mockResolvedValueOnce({stdout: '', stderr: ''})
        .mockRejectedValueOnce({
          stderr: 'Error: failed to perform "FetchReference" on source: ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix:99.99.99: not found',
          message: 'Command failed',
        });

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'marketplace/services/phoenix', '--marketplace-version', '99.99.99']);

      expect(mockOutput.warning).toHaveBeenCalledWith('phoenix version 99.99.99 not found, skipping...');
    });

    it('fails on other helm errors (not version-not-found)', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:0.1.57',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({'ark-api': mockService});

      mockExeca
        .mockResolvedValueOnce({stdout: '', stderr: ''})
        .mockRejectedValueOnce({
          stderr: 'Error: network timeout',
          message: 'Command failed',
        });

      const command = createInstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test', 'ark-api', '--ark-version', '0.1.50'])
      ).rejects.toThrow('process.exit called');

      expect(mockOutput.error).toHaveBeenCalledWith('failed to install ark-api');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('does not modify chart path when version flag does not match registry', async () => {
      const mockService = {
        name: 'custom-service',
        helmReleaseName: 'custom-service',
        chartPath: 'oci://custom-registry.io/charts/service:1.0.0',
        namespace: 'default',
      };
      mockGetInstallableServices.mockReturnValue({'custom-service': mockService});
      mockExeca.mockResolvedValue({stdout: '', stderr: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'custom-service', '--ark-version', '0.1.50']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        expect.arrayContaining([
          'oci://custom-registry.io/charts/service:1.0.0',
        ]),
        expect.any(Object)
      );
    });

    it('replaces existing marketplace version instead of appending', async () => {
      const mockService = {
        name: 'phoenix',
        helmReleaseName: 'phoenix',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix:0.1.5',
        namespace: 'default',
      };
      mockIsMarketplaceService.mockReturnValue(true);
      mockGetMarketplaceItem.mockResolvedValue(mockService);
      mockExeca.mockResolvedValue({stdout: '', stderr: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'marketplace/services/phoenix', '--marketplace-version', '0.1.7']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        expect.arrayContaining([
          'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix:0.1.7',
        ]),
        expect.any(Object)
      );
    });
  });

  describe('controller-first ordering', () => {
    it('installs ark-controller before ark-apiserver in non-interactive mode', async () => {
      const mockServices = {
        'ark-apiserver': {
          name: 'ark-apiserver',
          helmReleaseName: 'ark-apiserver',
          chartPath: './charts/ark-apiserver',
          namespace: 'ark-system',
          category: 'core',
        },
        'ark-controller': {
          name: 'ark-controller',
          helmReleaseName: 'ark-controller',
          chartPath: './charts/ark-controller',
          namespace: 'ark-system',
          category: 'core',
        },
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          chartPath: './charts/ark-api',
          namespace: 'ark-system',
          category: 'core',
        },
      };
      mockGetInstallableServices.mockReturnValue(mockServices);
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', '-y']);

      const helmInstallCalls = mockExeca.mock.calls.filter(
        (call: any) => call[0] === 'helm' && call[1][0] === 'upgrade'
      );

      // ark-controller should be first
      expect(helmInstallCalls[0][1]).toContain('ark-controller');
      // ark-api and ark-apiserver should come after (in alphabetical order)
      expect(helmInstallCalls[1][1]).toContain('ark-api');
      expect(helmInstallCalls[2][1]).toContain('ark-apiserver');
    });

    it('installs ark-controller first in interactive mode', async () => {
      Object.assign(mockArkServices, {
        'ark-apiserver': {
          name: 'ark-apiserver',
          helmReleaseName: 'ark-apiserver',
          chartPath: './charts/ark-apiserver',
          namespace: 'ark-system',
          category: 'core',
          description: 'API server',
          enabled: true,
          mandatory: true,
        },
        'ark-controller': {
          name: 'ark-controller',
          helmReleaseName: 'ark-controller',
          chartPath: './charts/ark-controller',
          namespace: 'ark-system',
          category: 'core',
          description: 'Controller',
          enabled: true,
          mandatory: true,
        },
        'ark-completions': {
          name: 'ark-completions',
          helmReleaseName: 'ark-completions',
          chartPath: './charts/ark-completions',
          namespace: 'ark-system',
          category: 'core',
          description: 'Completions',
          enabled: true,
          mandatory: true,
        },
      });
      Object.assign(mockArkDependencies, {
        'cert-manager-repo': {
          name: 'cert-manager-repo',
          command: 'helm',
          args: ['repo', 'add', 'jetstack', 'https://charts.jetstack.io'],
          description: 'Add Jetstack Helm repository',
        },
        'helm-repo-update': {
          name: 'helm-repo-update',
          command: 'helm',
          args: ['repo', 'update'],
          description: 'Update Helm repositories',
        },
        'cert-manager': {
          name: 'cert-manager',
          command: 'helm',
          args: ['upgrade', '--install', 'cert-manager', 'jetstack/cert-manager'],
          description: 'Certificate management',
        },
        'gateway-api-crds': {
          name: 'gateway-api-crds',
          command: 'kubectl',
          args: ['apply', '-f', 'https://example.com/gateway-api.yaml'],
          description: 'Gateway API CRDs',
        },
      });
      mockGetInstallableServices.mockReturnValue(mockArkServices);
      mockPrompt.mockResolvedValue({components: []});
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test']);

      const helmInstallCalls = mockExeca.mock.calls.filter(
        (call: any) => call[0] === 'helm' && call[1][0] === 'upgrade' && call[1][1] === '--install'
      );

      // Find the index of controller install
      const controllerIndex = helmInstallCalls.findIndex((call: any) =>
        call[1].includes('ark-controller')
      );
      const apiserverIndex = helmInstallCalls.findIndex((call: any) =>
        call[1].includes('ark-apiserver')
      );
      const completionsIndex = helmInstallCalls.findIndex((call: any) =>
        call[1].includes('ark-completions')
      );

      // ark-controller should be installed before both ark-apiserver and ark-completions
      expect(controllerIndex).toBeGreaterThanOrEqual(0);
      expect(apiserverIndex).toBeGreaterThan(controllerIndex);
      expect(completionsIndex).toBeGreaterThan(controllerIndex);
    });

    it('handles single service install when ark-controller is the only service', async () => {
      const mockService = {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        chartPath: './charts/ark-controller',
        namespace: 'ark-system',
        category: 'core',
      };
      mockGetInstallableServices.mockReturnValue({'ark-controller': mockService});
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-controller']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        expect.arrayContaining(['ark-controller']),
        expect.any(Object)
      );
      expect(mockOutput.success).toHaveBeenCalledWith('ark-controller installed successfully');
    });

    it('maintains alphabetical order for non-controller services', async () => {
      const mockServices = {
        'ark-dashboard': {
          name: 'ark-dashboard',
          helmReleaseName: 'ark-dashboard',
          chartPath: './charts/ark-dashboard',
          namespace: 'default',
          category: 'core',
        },
        'ark-controller': {
          name: 'ark-controller',
          helmReleaseName: 'ark-controller',
          chartPath: './charts/ark-controller',
          namespace: 'ark-system',
          category: 'core',
        },
        'ark-broker': {
          name: 'ark-broker',
          helmReleaseName: 'ark-broker',
          chartPath: './charts/ark-broker',
          namespace: 'default',
          category: 'core',
        },
        'ark-api': {
          name: 'ark-api',
          helmReleaseName: 'ark-api',
          chartPath: './charts/ark-api',
          namespace: 'default',
          category: 'core',
        },
      };
      mockGetInstallableServices.mockReturnValue(mockServices);
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', '-y']);

      const helmInstallCalls = mockExeca.mock.calls.filter(
        (call: any) => call[0] === 'helm' && call[1][0] === 'upgrade'
      );

      // ark-controller should be first
      expect(helmInstallCalls[0][1]).toContain('ark-controller');
      // Others should be alphabetical
      expect(helmInstallCalls[1][1]).toContain('ark-api');
      expect(helmInstallCalls[2][1]).toContain('ark-broker');
      expect(helmInstallCalls[3][1]).toContain('ark-dashboard');
    });
  });

  describe('storage backend', () => {
    const pgConfig = {
      clusterInfo: {
        context: 'test-cluster',
        type: 'minikube',
        namespace: 'default',
      },
      storage: {
        backend: 'postgresql',
        postgresql: {
          host: 'db.example.com',
          port: 5432,
          database: 'ark',
          user: 'ark_user',
          passwordSecretName: 'my-secret',
          passwordSecretKey: 'password',
          sslMode: 'require',
        },
      },
    } as any;

    it('rejects unknown backend value from CLI flag', async () => {
      const command = createInstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test', '--backend', 'mysql'])
      ).rejects.toThrow('process.exit called');

      expect(mockOutput.error).toHaveBeenCalledWith(
        "Invalid backend value: mysql. Expected 'etcd' or 'postgresql'."
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('errors when storage.backend is postgresql but storage.postgresql block is missing', async () => {
      const brokenConfig = {
        ...mockConfig,
        storage: {backend: 'postgresql'},
      };
      const command = createInstallCommand(brokenConfig);

      await expect(
        command.parseAsync(['node', 'test'])
      ).rejects.toThrow('process.exit called');

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining("missing 'storage.postgresql' block")
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('errors when storage.postgresql is missing required fields', async () => {
      const brokenConfig = {
        ...mockConfig,
        storage: {
          backend: 'postgresql',
          postgresql: {host: 'db.example.com'},
        },
      };
      const command = createInstallCommand(brokenConfig);

      await expect(
        command.parseAsync(['node', 'test'])
      ).rejects.toThrow('process.exit called');

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('storage.postgresql.user')
      );
    });

    it('reads backend from config.storage.backend by default', async () => {
      const mockService = {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        chartPath: './charts/ark-controller',
        namespace: 'ark-system',
        installArgs: ['--create-namespace', '--set', 'rbac.enable=true'],
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-controller': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(pgConfig);
      await command.parseAsync(['node', 'test', 'ark-controller']);

      const installCall = mockExeca.mock.calls.find(
        (call: any) =>
          call[0] === 'helm' &&
          call[1][0] === 'upgrade' &&
          call[1].includes('ark-controller')
      );
      expect(installCall).toBeDefined();
      const args = installCall![1];
      expect(args).toContain('storage.backend=postgresql');
    });

    it('CLI --backend overrides config.storage.backend', async () => {
      const mockService = {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        chartPath: './charts/ark-controller',
        namespace: 'ark-system',
        installArgs: ['--create-namespace', '--set', 'rbac.enable=true'],
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-controller': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(pgConfig);
      await command.parseAsync([
        'node',
        'test',
        'ark-controller',
        '--backend',
        'etcd',
      ]);

      const installCall = mockExeca.mock.calls.find(
        (call: any) => call[0] === 'helm' && call[1][0] === 'upgrade'
      );
      expect(installCall).toBeDefined();
      const args = installCall![1];
      expect(args.join(' ')).not.toContain('storage.backend=postgresql');
    });

    it('passes only storage.backend=postgresql to ark-controller (no connection details)', async () => {
      const mockService = {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        chartPath: './charts/ark-controller',
        namespace: 'ark-system',
        installArgs: ['--create-namespace', '--set', 'rbac.enable=true'],
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-controller': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(pgConfig);
      await command.parseAsync(['node', 'test', 'ark-controller']);

      const installCall = mockExeca.mock.calls.find(
        (call: any) =>
          call[0] === 'helm' &&
          call[1][0] === 'upgrade' &&
          call[1].includes('ark-controller')
      );
      expect(installCall).toBeDefined();
      const args = installCall![1];
      expect(args).toContain('storage.backend=postgresql');
      expect(args.join(' ')).not.toContain('postgresql.host');
    });

    it('passes translated --set keys to ark-apiserver in postgresql mode', async () => {
      const mockService = {
        name: 'ark-apiserver',
        helmReleaseName: 'ark-apiserver',
        chartPath: './charts/ark-apiserver',
        namespace: 'ark-system',
        requiresBackend: 'postgresql',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-apiserver': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(pgConfig);
      await command.parseAsync(['node', 'test', 'ark-apiserver']);

      const installCall = mockExeca.mock.calls.find(
        (call: any) =>
          call[0] === 'helm' &&
          call[1][0] === 'upgrade' &&
          call[1].includes('ark-apiserver')
      );
      expect(installCall).toBeDefined();
      const args = installCall![1];
      expect(args).toContain('postgresql.host=db.example.com');
      expect(args).toContain('postgresql.user=ark_user');
      expect(args).toContain('postgresql.passwordSecretName=my-secret');
      expect(args).toContain('postgresql.sslMode=require');
      expect(args.join(' ')).not.toContain('storage.backend=postgresql');
    });

    it('does not append backend args in etcd mode (default)', async () => {
      const mockService = {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        chartPath: './charts/ark-controller',
        namespace: 'ark-system',
        installArgs: ['--create-namespace', '--set', 'rbac.enable=true'],
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-controller': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-controller']);

      const installCall = mockExeca.mock.calls.find(
        (call: any) => call[0] === 'helm' && call[1][0] === 'upgrade'
      );
      expect(installCall).toBeDefined();
      const args = installCall![1];
      expect(args.join(' ')).not.toContain('storage.backend');
      expect(args.join(' ')).not.toContain('postgresql.host');
    });
  });

  describe('ark-apiserver readiness checks', () => {
    const pgConfig = {
      clusterInfo: {
        context: 'test-cluster',
        type: 'minikube',
        namespace: 'default',
      },
      storage: {
        backend: 'postgresql',
        postgresql: {
          host: 'db.example.com',
          user: 'ark_user',
          passwordSecretName: 'my-secret',
          sslMode: 'require',
        },
      },
    } as any;

    it('waits for ark-apiserver readiness after install in postgresql mode', async () => {
      const mockService = {
        name: 'ark-apiserver',
        helmReleaseName: 'ark-apiserver',
        chartPath: './charts/ark-apiserver',
        namespace: 'ark-system',
        requiresBackend: 'postgresql',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-apiserver': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});
      mockRunReadinessChecks.mockResolvedValue([
        {name: 'APIServices available', passed: true, durationMs: 100},
        {name: 'API group registered', passed: true, durationMs: 100},
      ]);

      const command = createInstallCommand(pgConfig);
      await command.parseAsync(['node', 'test', 'ark-apiserver']);

      expect(mockRunReadinessChecks).toHaveBeenCalledWith(120);
    });

    it('exits with error if ark-apiserver readiness check fails', async () => {
      const mockService = {
        name: 'ark-apiserver',
        helmReleaseName: 'ark-apiserver',
        chartPath: './charts/ark-apiserver',
        namespace: 'ark-system',
        requiresBackend: 'postgresql',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-apiserver': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});
      mockRunReadinessChecks.mockResolvedValue([
        {name: 'APIServices available', passed: false, durationMs: 100, message: 'timed out'},
      ]);

      const command = createInstallCommand(pgConfig);
      await expect(
        command.parseAsync(['node', 'test', 'ark-apiserver'])
      ).rejects.toThrow('process.exit called');

      expect(mockOutput.error).toHaveBeenCalledWith('ark-apiserver is not ready. Stopping installation.');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits with error if ark-apiserver readiness check throws', async () => {
      const mockService = {
        name: 'ark-apiserver',
        helmReleaseName: 'ark-apiserver',
        chartPath: './charts/ark-apiserver',
        namespace: 'ark-system',
        requiresBackend: 'postgresql',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-apiserver': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});
      mockRunReadinessChecks.mockRejectedValue(new Error('kubectl not found'));

      const command = createInstallCommand(pgConfig);
      await expect(
        command.parseAsync(['node', 'test', 'ark-apiserver'])
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('does not run readiness checks for ark-apiserver in etcd mode', async () => {
      const mockService = {
        name: 'ark-apiserver',
        helmReleaseName: 'ark-apiserver',
        chartPath: './charts/ark-apiserver',
        namespace: 'ark-system',
        requiresBackend: 'postgresql',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-apiserver': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-apiserver']);

      expect(mockRunReadinessChecks).not.toHaveBeenCalled();
    });

    it('does not run readiness checks for other services in postgresql mode', async () => {
      const mockService = {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        chartPath: './charts/ark-controller',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({
        'ark-controller': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});

      const command = createInstallCommand(pgConfig);
      await command.parseAsync(['node', 'test', 'ark-controller']);

      expect(mockRunReadinessChecks).not.toHaveBeenCalled();
    });

    it('waits for ark-apiserver readiness in interactive mode', async () => {
      const mockService = {
        name: 'ark-apiserver',
        helmReleaseName: 'ark-apiserver',
        chartPath: './charts/ark-apiserver',
        namespace: 'ark-system',
        requiresBackend: 'postgresql',
        category: 'core',
        mandatory: true,
        enabled: true,
      };
      Object.assign(mockArkServices, {'ark-apiserver': mockService});
      Object.assign(mockArkDependencies, {
        'cert-manager-repo': {
          name: 'cert-manager-repo',
          command: 'helm',
          args: ['repo', 'add', 'jetstack', 'https://charts.jetstack.io'],
          description: 'Add Jetstack Helm repository',
        },
        'helm-repo-update': {
          name: 'helm-repo-update',
          command: 'helm',
          args: ['repo', 'update'],
          description: 'Update Helm repositories',
        },
        'cert-manager': {
          name: 'cert-manager',
          command: 'helm',
          args: ['upgrade', '--install', 'cert-manager', 'jetstack/cert-manager'],
          description: 'Certificate management',
        },
        'gateway-api-crds': {
          name: 'gateway-api-crds',
          command: 'kubectl',
          args: ['apply', '-f', 'https://example.com/gateway-api.yaml'],
          description: 'Gateway API CRDs',
        },
      });
      mockGetInstallableServices.mockReturnValue({
        'ark-apiserver': mockService,
      });
      mockExeca.mockResolvedValue({stdout: ''});
      mockPrompt.mockResolvedValue({
        components: ['ark-apiserver'],
        installGatewayApi: false,
      });
      mockRunReadinessChecks.mockResolvedValue([
        {name: 'APIServices available', passed: true, durationMs: 100},
        {name: 'API group registered', passed: true, durationMs: 100},
      ]);

      const command = createInstallCommand(pgConfig);
      await command.parseAsync(['node', 'test']);

      expect(mockRunReadinessChecks).toHaveBeenCalledWith(120);
    });
  });

  describe('version validation', () => {
    it('rejects invalid ARK version format', async () => {
      const command = createInstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test', 'ark-api', '--ark-version', 'invalid'])
      ).rejects.toThrow('process.exit called');

      expect(mockOutput.error).toHaveBeenCalledWith(
        'Invalid ARK version format: invalid. Expected semantic versioning (e.g., 0.1.50)'
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('rejects invalid marketplace version format', async () => {
      const command = createInstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test', 'marketplace/services/phoenix', '--marketplace-version', 'v1.2'])
      ).rejects.toThrow('process.exit called');

      expect(mockOutput.error).toHaveBeenCalledWith(
        'Invalid marketplace version format: v1.2. Expected semantic versioning (e.g., 0.1.7)'
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('accepts version with pre-release tag', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:0.1.57',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({'ark-api': mockService});
      mockExeca.mockResolvedValue({stdout: '', stderr: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-api', '--ark-version', '1.0.0-rc1']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        expect.arrayContaining([
          'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:1.0.0-rc1',
        ]),
        expect.any(Object)
      );
    });

    it('accepts version with build metadata', async () => {
      const mockService = {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:0.1.57',
        namespace: 'ark-system',
      };
      mockGetInstallableServices.mockReturnValue({'ark-api': mockService});
      mockExeca.mockResolvedValue({stdout: '', stderr: ''});

      const command = createInstallCommand(mockConfig);
      await command.parseAsync(['node', 'test', 'ark-api', '--ark-version', '1.0.0+20240101']);

      expect(mockExeca).toHaveBeenCalledWith(
        'helm',
        expect.arrayContaining([
          'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts/ark-api:1.0.0+20240101',
        ]),
        expect.any(Object)
      );
    });


    it('rejects version with special characters', async () => {
      const command = createInstallCommand(mockConfig);

      await expect(
        command.parseAsync(['node', 'test', 'ark-api', '--ark-version', '0.1.50; rm -rf /'])
      ).rejects.toThrow('process.exit called');

      expect(mockOutput.error).toHaveBeenCalledWith(
        'Invalid ARK version format: 0.1.50; rm -rf /. Expected semantic versioning (e.g., 0.1.50)'
      );
    });
  });
});
