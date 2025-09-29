import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockOutput = {
  warning: jest.fn(),
  error: jest.fn(),
};
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

const {createAgentsCommand} = await import('./index.js');

describe('agents command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
