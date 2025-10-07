import {describe, it, expect, jest, beforeEach, afterEach} from '@jest/globals';

// Mock chalk to avoid ANSI codes in tests
jest.unstable_mockModule('chalk', () => ({
  default: {
    red: (str: string) => str,
    yellow: (str: string) => str,
    gray: (str: string) => str,
    blue: (str: string) => str,
  },
}));

// Mock commands module
jest.unstable_mockModule('./commands.js', () => ({
  checkCommandExists: jest.fn(),
}));

// Mock config module
jest.unstable_mockModule('./config.js', () => ({
  loadConfig: jest.fn(),
}));

// Mock execa module
jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

// Dynamic imports after mocks
const {checkCommandExists} = await import('./commands.js');
const {loadConfig} = await import('./config.js');
const {execa} = await import('execa');
const {startup} = await import('./startup.js');

// Type the mocks
const mockCheckCommandExists = checkCommandExists as any;
const mockLoadConfig = loadConfig as any;
const mockExeca = execa as any;

describe('startup', () => {
  let mockExit: jest.SpiedFunction<typeof process.exit>;
  let mockConsoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock execa to reject by default (no kubectl context)
    mockExeca.mockRejectedValue(new Error('No context'));
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    mockConsoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('returns config when all required commands are installed', async () => {
    const expectedConfig = {
      chat: {
        streaming: true,
        outputFormat: 'text',
      },
    };

    // Mock all commands as available
    mockCheckCommandExists.mockResolvedValue(true);
    mockLoadConfig.mockReturnValue(expectedConfig);

    const config = await startup();

    expect(config).toEqual(expectedConfig);
    expect(mockCheckCommandExists).toHaveBeenCalledWith('kubectl', [
      'version',
      '--client',
    ]);
    expect(mockCheckCommandExists).toHaveBeenCalledWith('helm', [
      'version',
      '--short',
    ]);
    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('exits with error when kubectl is missing', async () => {
    // Mock kubectl as missing, helm as available
    mockCheckCommandExists
      .mockResolvedValueOnce(false) // kubectl
      .mockResolvedValueOnce(true); // helm

    await expect(startup()).rejects.toThrow('process.exit');

    expect(mockConsoleError).toHaveBeenCalledWith('error: kubectl is required');
    expect(mockConsoleError).toHaveBeenCalledWith(
      '  https://kubernetes.io/docs/tasks/tools/'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits with error when helm is missing', async () => {
    // Mock kubectl as available, helm as missing
    mockCheckCommandExists
      .mockResolvedValueOnce(true) // kubectl
      .mockResolvedValueOnce(false); // helm

    await expect(startup()).rejects.toThrow('process.exit');

    expect(mockConsoleError).toHaveBeenCalledWith('error: helm is required');
    expect(mockConsoleError).toHaveBeenCalledWith(
      '  https://helm.sh/docs/intro/install/'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits with error when both commands are missing', async () => {
    // Mock both commands as missing
    mockCheckCommandExists.mockResolvedValue(false);

    await expect(startup()).rejects.toThrow('process.exit');

    expect(mockConsoleError).toHaveBeenCalledWith('error: kubectl is required');
    expect(mockConsoleError).toHaveBeenCalledWith(
      '  https://kubernetes.io/docs/tasks/tools/'
    );
    expect(mockConsoleError).toHaveBeenCalledWith('error: helm is required');
    expect(mockConsoleError).toHaveBeenCalledWith(
      '  https://helm.sh/docs/intro/install/'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('checks commands with correct arguments', async () => {
    mockCheckCommandExists.mockResolvedValue(true);
    mockLoadConfig.mockReturnValue({chat: {}});

    await startup();

    expect(mockCheckCommandExists).toHaveBeenCalledTimes(2);
    expect(mockCheckCommandExists).toHaveBeenNthCalledWith(1, 'kubectl', [
      'version',
      '--client',
    ]);
    expect(mockCheckCommandExists).toHaveBeenNthCalledWith(2, 'helm', [
      'version',
      '--short',
    ]);
  });

  it('loads config after checking requirements', async () => {
    mockCheckCommandExists.mockResolvedValue(true);
    const expectedConfig = {chat: {streaming: false}};
    mockLoadConfig.mockReturnValue(expectedConfig);

    const config = await startup();

    // Verify order - checkCommandExists should be called before loadConfig
    const checkCallOrder = mockCheckCommandExists.mock.invocationCallOrder[0];
    const loadCallOrder = mockLoadConfig.mock.invocationCallOrder[0];
    expect(checkCallOrder).toBeLessThan(loadCallOrder);
    expect(config).toEqual(expectedConfig);
  });

  it('includes cluster context when available', async () => {
    mockCheckCommandExists.mockResolvedValue(true);
    mockLoadConfig.mockReturnValue({chat: {streaming: true}});
    // Mock successful kubectl context check
    mockExeca.mockResolvedValue({
      stdout: 'minikube',
      stderr: '',
    });

    const config = await startup();

    expect(config.clusterInfo).toEqual({
      type: 'unknown',
      context: 'minikube',
    });
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['config', 'current-context'],
      {timeout: 5000}
    );
  });

  it('handles missing kubectl context gracefully', async () => {
    mockCheckCommandExists.mockResolvedValue(true);
    const expectedConfig = {chat: {streaming: false}};
    mockLoadConfig.mockReturnValue(expectedConfig);
    // mockExeca already mocked to reject in beforeEach

    const config = await startup();

    expect(config).toEqual(expectedConfig);
    expect(config.clusterInfo).toBeUndefined();
  });
});
