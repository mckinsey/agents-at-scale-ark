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

const mockCreateModel = jest.fn();
jest.unstable_mockModule('./create.js', () => ({
  createModel: mockCreateModel,
}));

const mockExecuteQuery = jest.fn();
jest.unstable_mockModule('../../lib/executeQuery.js', () => ({
  executeQuery: mockExecuteQuery,
  parseTarget: jest.fn(),
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

const {createModelsCommand} = await import('./index.js');

describe('models command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates command with correct structure', () => {
    const command = createModelsCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('models');
  });

  it('lists models in text format', async () => {
    const mockModels = {
      items: [{metadata: {name: 'gpt-4'}}, {metadata: {name: 'claude-3'}}],
    };
    mockExeca.mockResolvedValue({stdout: JSON.stringify(mockModels)});

    const command = createModelsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'models', '-o', 'json'],
      {stdio: 'pipe'}
    );
    expect(mockConsoleLog).toHaveBeenCalledWith('gpt-4');
    expect(mockConsoleLog).toHaveBeenCalledWith('claude-3');
  });

  it('lists models in json format', async () => {
    const mockModels = {
      items: [{metadata: {name: 'gpt-4'}}],
    };
    mockExeca.mockResolvedValue({stdout: JSON.stringify(mockModels)});

    const command = createModelsCommand({});
    await command.parseAsync(['node', 'test', '-o', 'json']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify(mockModels.items, null, 2)
    );
  });

  it('shows info when no models', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({items: []})});

    const command = createModelsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockOutput.info).toHaveBeenCalledWith('No models found');
  });

  it('handles errors', async () => {
    mockExeca.mockRejectedValue(new Error('kubectl failed'));

    const command = createModelsCommand({});

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow(
      'process.exit called'
    );
    expect(mockOutput.error).toHaveBeenCalledWith(
      'fetching models:',
      'kubectl failed'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('list subcommand works', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({items: []})});

    const command = createModelsCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockExeca).toHaveBeenCalled();
  });

  it('create subcommand works', async () => {
    const command = createModelsCommand({});
    await command.parseAsync(['node', 'test', 'create', 'my-model']);

    expect(mockCreateModel).toHaveBeenCalledWith(
      'my-model',
      expect.objectContaining({})
    );
  });

  it('query subcommand works', async () => {
    const command = createModelsCommand({});
    await command.parseAsync([
      'node',
      'test',
      'query',
      'default',
      'Hello world',
    ]);

    expect(mockExecuteQuery).toHaveBeenCalledWith({
      targetType: 'model',
      targetName: 'default',
      message: 'Hello world',
    });
  });
});
