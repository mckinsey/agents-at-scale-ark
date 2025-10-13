import {jest} from '@jest/globals';
import {Command} from 'commander';

// Mock execa to avoid real kubectl calls
jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
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

const {execa} = await import('execa');
const mockExeca = execa as any;

const {createTargetsCommand} = await import('./index.js');

describe('targets command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates command with correct structure', () => {
    const command = createTargetsCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('targets');
  });

  it('lists targets in text format', async () => {
    // Mock kubectl responses for each resource type (order: model, agent, team, tool)
    mockExeca
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [{metadata: {name: 'gpt-4'}, status: {available: true}}],
        }),
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [
            {metadata: {name: 'gpt-assistant'}, status: {phase: 'ready'}},
          ],
        }),
      })
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})});

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'models', '-o', 'json'],
      {
        stdio: 'pipe',
      }
    );
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'agents', '-o', 'json'],
      {
        stdio: 'pipe',
      }
    );
    expect(mockConsoleLog).toHaveBeenCalledWith('agent/gpt-assistant');
    expect(mockConsoleLog).toHaveBeenCalledWith('model/gpt-4');
  });

  it('lists targets in json format', async () => {
    // Order: model, agent, team, tool
    mockExeca
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [{metadata: {name: 'gpt'}, status: {phase: 'ready'}}],
        }),
      })
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})});

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test', '-o', 'json']);

    const expectedTargets = [
      {type: 'agent', name: 'gpt', id: 'agent/gpt', available: true},
    ];
    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify(expectedTargets, null, 2)
    );
  });

  it('filters targets by type', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({
        items: [
          {metadata: {name: 'gpt'}, status: {phase: 'ready'}},
          {metadata: {name: 'helper'}, status: {phase: 'ready'}},
        ],
      }),
    });

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test', '-t', 'agent']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'agents', '-o', 'json'],
      {
        stdio: 'pipe',
      }
    );
    expect(mockExeca).toHaveBeenCalledTimes(1); // Only agents, not other types
    expect(mockConsoleLog).toHaveBeenCalledWith('agent/gpt');
    expect(mockConsoleLog).toHaveBeenCalledWith('agent/helper');
  });

  it('sorts targets by type then name', async () => {
    // Order: model, agent, team, tool
    mockExeca
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [
            {metadata: {name: 'b'}, status: {available: true}},
            {metadata: {name: 'a'}, status: {available: true}},
          ],
        }),
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [
            {metadata: {name: 'z'}, status: {phase: 'ready'}},
            {metadata: {name: 'a'}, status: {phase: 'ready'}},
          ],
        }),
      })
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})});

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test']);

    // Check order of calls - sorted by type then name
    const calls = mockConsoleLog.mock.calls
      .filter((call) => call[0] && call[0].includes('/'))
      .map((call) => call[0]);
    expect(calls).toEqual(['agent/a', 'agent/z', 'model/a', 'model/b']);
  });

  it('shows warning when no targets', async () => {
    // All resource types return empty (order: model, agent, team, tool)
    mockExeca
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})});

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockOutput.warning).toHaveBeenCalledWith('no targets available');
  });

  it('handles errors', async () => {
    mockExeca.mockRejectedValue(new Error('kubectl not found'));

    const command = createTargetsCommand({});

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow(
      'process.exit called'
    );
    expect(mockOutput.error).toHaveBeenCalledWith(
      'fetching targets:',
      'kubectl not found'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('list subcommand works', async () => {
    // Order: model, agent, team, tool
    mockExeca
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})})
      .mockResolvedValueOnce({stdout: JSON.stringify({items: []})});

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'models', '-o', 'json'],
      {
        stdio: 'pipe',
      }
    );
  });
});
