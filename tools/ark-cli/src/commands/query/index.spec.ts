import {vi} from 'vitest';
import {Command} from 'commander';

const mockExecuteQuery = vi.fn() as any;
const mockParseTarget = vi.fn() as any;

vi.mock('../../lib/executeQuery.js', () => ({
  executeQuery: mockExecuteQuery,
  parseTarget: mockParseTarget,
  // Real parseParameters is unit-tested in executeQuery.spec.ts; stub its contract here.
  parseParameters: (params: string[]) =>
    params.map((p) => {
      const i = p.indexOf('=');
      if (i === -1) {
        throw new Error(`parameter must be in name=value format, got: ${p}`);
      }
      return {name: p.slice(0, i).trim(), value: p.slice(i + 1).trim()};
    }),
}));

const mockOutput = {
  error: vi.fn(),
};
vi.mock('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleError = vi
  .spyOn(console, 'error')
  .mockImplementation(() => {});

const {createQueryCommand} = await import('./index.js');

describe('createQueryCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      parameters: [],
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
      parameters: [],
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
      parameters: [],
      sessionId: 'my-session-123',
    });
  });

  it('should pass conversation-id option to executeQuery', async () => {
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
      '--conversation-id',
      'my-conversation-456',
    ]);

    expect(mockParseTarget).toHaveBeenCalledWith('agent/test-agent');
    expect(mockExecuteQuery).toHaveBeenCalledWith({
      targetType: 'agent',
      targetName: 'test-agent',
      message: 'Hello world',
      outputFormat: undefined,
      parameters: [],
      conversationId: 'my-conversation-456',
    });
  });

  it('should pass both session-id and conversation-id options to executeQuery', async () => {
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
      '--conversation-id',
      'my-conversation-456',
    ]);

    expect(mockExecuteQuery).toHaveBeenCalledWith({
      targetType: 'agent',
      targetName: 'test-agent',
      message: 'Hello world',
      outputFormat: undefined,
      parameters: [],
      sessionId: 'my-session-123',
      conversationId: 'my-conversation-456',
    });
  });

  it('should pass parameters to executeQuery', async () => {
    mockParseTarget.mockReturnValue({
      type: 'agent',
      name: 'param-test-agent',
    });

    mockExecuteQuery.mockResolvedValue(undefined);

    const command = createQueryCommand({} as any);

    await command.parseAsync([
      'node',
      'test',
      'agent/param-test-agent',
      'Hello world',
      '-p',
      'weather=BANANA',
      '--parameter',
      'unit=celsius',
    ]);

    expect(mockExecuteQuery).toHaveBeenCalledWith({
      targetType: 'agent',
      targetName: 'param-test-agent',
      message: 'Hello world',
      outputFormat: undefined,
      parameters: [
        {name: 'weather', value: 'BANANA'},
        {name: 'unit', value: 'celsius'},
      ],
    });
  });

  it('should exit on malformed parameter', async () => {
    mockParseTarget.mockReturnValue({type: 'agent', name: 'a'});

    const command = createQueryCommand({} as any);

    await expect(
      command.parseAsync([
        'node',
        'test',
        'agent/a',
        'Hello',
        '-p',
        'noequals',
      ])
    ).rejects.toThrow('process.exit called');

    expect(mockExecuteQuery).not.toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('name=value')
    );
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
