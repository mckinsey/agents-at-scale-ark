import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockOutput = {
  info: jest.fn(),
  error: jest.fn(),
};
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

const {createTeamsCommand} = await import('./index.js');

describe('teams command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates command with correct structure', () => {
    const command = createTeamsCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('teams');
  });

  it('lists teams in text format', async () => {
    const mockTeams = {
      items: [
        {metadata: {name: 'engineering'}},
        {metadata: {name: 'data-science'}},
      ],
    };
    mockExeca.mockResolvedValue({stdout: JSON.stringify(mockTeams)});

    const command = createTeamsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'teams', '-o', 'json'],
      {stdio: 'pipe'}
    );
    expect(mockConsoleLog).toHaveBeenCalledWith('engineering');
    expect(mockConsoleLog).toHaveBeenCalledWith('data-science');
  });

  it('lists teams in json format', async () => {
    const mockTeams = {
      items: [{metadata: {name: 'engineering'}}],
    };
    mockExeca.mockResolvedValue({stdout: JSON.stringify(mockTeams)});

    const command = createTeamsCommand({});
    await command.parseAsync(['node', 'test', '-o', 'json']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify(mockTeams.items, null, 2)
    );
  });

  it('shows info when no teams', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({items: []})});

    const command = createTeamsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockOutput.info).toHaveBeenCalledWith('No teams found');
  });

  it('handles errors', async () => {
    mockExeca.mockRejectedValue(new Error('kubectl failed'));

    const command = createTeamsCommand({});

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow(
      'process.exit called'
    );
    expect(mockOutput.error).toHaveBeenCalledWith(
      'fetching teams:',
      'kubectl failed'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('list subcommand works', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({items: []})});

    const command = createTeamsCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockExeca).toHaveBeenCalled();
  });
});
