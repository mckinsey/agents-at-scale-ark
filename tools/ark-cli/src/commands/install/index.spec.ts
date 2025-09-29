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
};
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

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
    jest.clearAllMocks();
    mockGetClusterInfo.mockResolvedValue({
      context: 'test-cluster',
      type: 'minikube',
      namespace: 'default',
    });
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

  it('exits when cluster not connected', async () => {
    mockGetClusterInfo.mockResolvedValue({error: true});

    const command = createInstallCommand({});

    await expect(
      command.parseAsync(['node', 'test', 'ark-api'])
    ).rejects.toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
