import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockExeca = jest.fn(() => Promise.resolve()) as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockGetClusterInfo = jest.fn() as any;
jest.unstable_mockModule('../../lib/cluster.js', () => ({
  getClusterInfo: mockGetClusterInfo,
}));

const mockGetInstallableServices = jest.fn() as any;
const mockArkServices = {};
jest.unstable_mockModule('../../arkServices.js', () => ({
  getInstallableServices: mockGetInstallableServices,
  arkServices: mockArkServices,
}));

const mockOutput = {
  error: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
};
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

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
    jest.clearAllMocks();
    mockGetClusterInfo.mockResolvedValue({
      context: 'test-cluster',
      type: 'minikube',
      namespace: 'default',
    });
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
});
