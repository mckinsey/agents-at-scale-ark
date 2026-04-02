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
      {stdio: 'inherit'}
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'ark-api installed successfully'
    );
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
      {stdio: 'inherit'}
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
      {stdio: 'inherit'}
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
        {stdio: 'inherit'}
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
        {stdio: 'inherit'}
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
        {stdio: 'inherit'}
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
});
