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

const {createToolsCommand} = await import('./index.js');

describe('tools command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates command with correct structure', () => {
    const command = createToolsCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('tools');
  });

  it('lists tools in text format', async () => {
    const mockTools = {
      items: [
        {metadata: {name: 'github-mcp'}},
        {metadata: {name: 'slack-mcp'}},
      ],
    };
    mockExeca.mockResolvedValue({stdout: JSON.stringify(mockTools)});

    const command = createToolsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'mcpservers', '-o', 'json'],
      {stdio: 'pipe'}
    );
    expect(mockConsoleLog).toHaveBeenCalledWith('github-mcp');
    expect(mockConsoleLog).toHaveBeenCalledWith('slack-mcp');
  });

  it('lists tools in json format', async () => {
    const mockTools = {
      items: [{metadata: {name: 'github-mcp'}}],
    };
    mockExeca.mockResolvedValue({stdout: JSON.stringify(mockTools)});

    const command = createToolsCommand({});
    await command.parseAsync(['node', 'test', '-o', 'json']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify(mockTools.items, null, 2)
    );
  });

  it('shows info when no tools', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({items: []})});

    const command = createToolsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockOutput.info).toHaveBeenCalledWith('No tools found');
  });

  it('handles errors', async () => {
    mockExeca.mockRejectedValue(new Error('kubectl failed'));

    const command = createToolsCommand({});

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow(
      'process.exit called'
    );
    expect(mockOutput.error).toHaveBeenCalledWith(
      'fetching tools:',
      'kubectl failed'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('list subcommand works', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({items: []})});

    const command = createToolsCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockExeca).toHaveBeenCalled();
  });
});
