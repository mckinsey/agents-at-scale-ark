import {vi} from 'vitest';
import {Command} from 'commander';

const mockExeca = vi.fn() as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockExecuteQuery = vi.fn() as any;
vi.mock('../../lib/executeQuery.js', () => ({
  executeQuery: mockExecuteQuery,
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
  warning: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi
  .spyOn(console, 'error')
  .mockImplementation(() => {});

const {createAgentsCommand} = await import('./index.js');

describe('agents command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates command with correct structure', () => {
    const command = createAgentsCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('agents');
  });

  it('lists agents in text format', async () => {
    const mockAgents = {
      items: [{metadata: {name: 'agent1'}}, {metadata: {name: 'agent2'}}],
    };
    mockExeca.mockResolvedValue({stdout: JSON.stringify(mockAgents)});

    const command = createAgentsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'agents', '-o', 'json'],
      {stdio: 'pipe'}
    );
    expect(mockConsoleLog).toHaveBeenCalledWith('agent1');
    expect(mockConsoleLog).toHaveBeenCalledWith('agent2');
  });

  it('lists agents in json format', async () => {
    const mockAgents = {
      items: [{metadata: {name: 'agent1'}}],
    };
    mockExeca.mockResolvedValue({stdout: JSON.stringify(mockAgents)});

    const command = createAgentsCommand({});
    await command.parseAsync(['node', 'test', '-o', 'json']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify(mockAgents.items, null, 2)
    );
  });

  it('shows warning when no agents', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({items: []})});

    const command = createAgentsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockOutput.warning).toHaveBeenCalledWith('no agents available');
  });

  it('handles errors', async () => {
    mockExeca.mockRejectedValue(new Error('kubectl failed'));

    const command = createAgentsCommand({});

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow(
      'process.exit called'
    );
    expect(mockOutput.error).toHaveBeenCalledWith(
      'fetching agents:',
      'kubectl failed'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('list subcommand works', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({items: []})});

    const command = createAgentsCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockExeca).toHaveBeenCalled();
  });

  describe('query subcommand', () => {
    it('executes an agent query with parsed parameters', async () => {
      mockExecuteQuery.mockResolvedValue(undefined);

      const command = createAgentsCommand({});
      await command.parseAsync([
        'node',
        'test',
        'query',
        'weather-agent',
        'What is the weather?',
        '-p',
        'city=London',
        '--parameter',
        'unit=celsius',
      ]);

      expect(mockExecuteQuery).toHaveBeenCalledWith({
        targetType: 'agent',
        targetName: 'weather-agent',
        message: 'What is the weather?',
        timeout: undefined,
        parameters: [
          {name: 'city', value: 'London'},
          {name: 'unit', value: 'celsius'},
        ],
      });
    });

    it('passes the timeout option through to executeQuery', async () => {
      mockExecuteQuery.mockResolvedValue(undefined);

      const command = createAgentsCommand({});
      await command.parseAsync([
        'node',
        'test',
        'query',
        'weather-agent',
        'Hello',
        '--timeout',
        '30s',
      ]);

      expect(mockExecuteQuery).toHaveBeenCalledWith({
        targetType: 'agent',
        targetName: 'weather-agent',
        message: 'Hello',
        timeout: '30s',
        parameters: [],
      });
    });

    it('exits with an error on a malformed parameter', async () => {
      const command = createAgentsCommand({});

      await expect(
        command.parseAsync([
          'node',
          'test',
          'query',
          'weather-agent',
          'Hello',
          '-p',
          'noequals',
        ])
      ).rejects.toThrow('process.exit called');

      expect(mockExecuteQuery).not.toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('name=value')
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
