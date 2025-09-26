import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockGetClusterInfo = jest.fn() as any;
jest.unstable_mockModule('../../lib/cluster.js', () => ({
  getClusterInfo: mockGetClusterInfo,
}));

const mockOutput = {
  error: jest.fn(),
};
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

const {createGetCommand} = await import('./get.js');

describe('cluster get command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates command with correct structure', () => {
    const command = createGetCommand();

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('get');
  });

  it('displays cluster info in text format by default', async () => {
    mockGetClusterInfo.mockResolvedValue({
      context: 'test-cluster',
      namespace: 'default',
      type: 'minikube',
      ip: '192.168.1.1',
    });

    const command = createGetCommand();
    await command.parseAsync(['node', 'test']);

    expect(mockGetClusterInfo).toHaveBeenCalledWith(undefined);
    expect(mockConsoleLog).toHaveBeenCalledWith('context: test-cluster');
    expect(mockConsoleLog).toHaveBeenCalledWith('namespace: default');
    expect(mockConsoleLog).toHaveBeenCalledWith('type: minikube');
    expect(mockConsoleLog).toHaveBeenCalledWith('ip: 192.168.1.1');
  });

  it('displays cluster info in json format when requested', async () => {
    const clusterInfo = {
      context: 'prod-cluster',
      namespace: 'production',
      type: 'eks',
      ip: '10.0.0.1',
    };
    mockGetClusterInfo.mockResolvedValue(clusterInfo);

    const command = createGetCommand();
    await command.parseAsync(['node', 'test', '-o', 'json']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify(clusterInfo, null, 2)
    );
  });

  it('uses specified context when provided', async () => {
    mockGetClusterInfo.mockResolvedValue({
      context: 'custom-context',
      namespace: 'custom',
      type: 'kind',
      ip: '127.0.0.1',
    });

    const command = createGetCommand();
    await command.parseAsync(['node', 'test', '-c', 'custom-context']);

    expect(mockGetClusterInfo).toHaveBeenCalledWith('custom-context');
  });

  it('handles missing ip gracefully', async () => {
    mockGetClusterInfo.mockResolvedValue({
      context: 'test-cluster',
      namespace: 'default',
      type: 'unknown',
      ip: undefined,
    });

    const command = createGetCommand();
    await command.parseAsync(['node', 'test']);

    expect(mockConsoleLog).toHaveBeenCalledWith('ip: unknown');
  });

  it('exits with error when cluster info has error', async () => {
    mockGetClusterInfo.mockResolvedValue({
      error: 'No cluster found',
    });

    const command = createGetCommand();

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow(
      'process.exit called'
    );
    expect(mockOutput.error).toHaveBeenCalledWith(
      'getting cluster info:',
      'No cluster found'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles exceptions gracefully', async () => {
    mockGetClusterInfo.mockRejectedValue(new Error('Connection failed'));

    const command = createGetCommand();

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow(
      'process.exit called'
    );
    expect(mockOutput.error).toHaveBeenCalledWith(
      'failed to get cluster info:',
      'Connection failed'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
