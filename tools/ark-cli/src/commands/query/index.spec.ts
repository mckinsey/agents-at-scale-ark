import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockExecuteQuery = jest.fn() as any;
const mockParseTarget = jest.fn() as any;

jest.unstable_mockModule('../../lib/executeQuery.js', () => ({
  executeQuery: mockExecuteQuery,
  parseTarget: mockParseTarget,
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

const mockConsoleError = jest
  .spyOn(console, 'error')
  .mockImplementation(() => {});

const {createQueryCommand} = await import('./index.js');

describe('createQueryCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a query command', () => {
    const command = createQueryCommand({} as any);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('query');
    expect(command.description()).toBe(
      'Execute a single query against a model or agent'
    );
  });

  it('should parse and execute query with valid target', async () => {
    mockParseTarget.mockReturnValue({
      type: 'model',
      name: 'default',
    });

    mockExecuteQuery.mockResolvedValue(undefined);

    const command = createQueryCommand({} as any);

    await command.parseAsync(['node', 'test', 'model/default', 'Hello world']);

    expect(mockParseTarget).toHaveBeenCalledWith('model/default');
    expect(mockExecuteQuery).toHaveBeenCalledWith({
      targetType: 'model',
      targetName: 'default',
      message: 'Hello world',
      outputFormat: undefined,
    });
  });

  it('should pass output format option to executeQuery', async () => {
    mockParseTarget.mockReturnValue({
      type: 'model',
      name: 'default',
    });

    mockExecuteQuery.mockResolvedValue(undefined);

    const command = createQueryCommand({} as any);

    await command.parseAsync([
      'node',
      'test',
      'model/default',
      'Hello world',
      '-o',
      'json',
    ]);

    expect(mockParseTarget).toHaveBeenCalledWith('model/default');
    expect(mockExecuteQuery).toHaveBeenCalledWith({
      targetType: 'model',
      targetName: 'default',
      message: 'Hello world',
      outputFormat: 'json',
    });
  });

  it('should pass session-id option to executeQuery', async () => {
    mockParseTarget.mockReturnValue({
      type: 'agent',
      name: 'test-agent',
    });

    mockExecuteQuery.mockResolvedValue(undefined);

    const command = createQueryCommand({} as any);

    await command.parseAsync([
      'node',
      'test',
      'agent/test-agent',
      'Hello world',
      '--session-id',
      'my-session-123',
    ]);

    expect(mockParseTarget).toHaveBeenCalledWith('agent/test-agent');
    expect(mockExecuteQuery).toHaveBeenCalledWith({
      targetType: 'agent',
      targetName: 'test-agent',
      message: 'Hello world',
      outputFormat: undefined,
      sessionId: 'my-session-123',
    });
  });

  it('should error on invalid target format', async () => {
    mockParseTarget.mockReturnValue(null);

    const command = createQueryCommand({} as any);

    await expect(
      command.parseAsync(['node', 'test', 'invalid-target', 'Hello'])
    ).rejects.toThrow('process.exit called');

    expect(mockParseTarget).toHaveBeenCalledWith('invalid-target');
    expect(mockExecuteQuery).not.toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid target format')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
