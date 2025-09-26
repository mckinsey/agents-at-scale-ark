import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

const {createCompletionCommand} = await import('./index.js');

describe('completion command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates command with correct structure', () => {
    const command = createCompletionCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('completion');
  });

  it('shows help when called without subcommand', async () => {
    const command = createCompletionCommand({});
    await command.parseAsync(['node', 'test']);

    // Check first call contains the title (strip ANSI color codes)
    expect(mockConsoleLog.mock.calls[0][0]).toContain(
      'Shell completion for ARK CLI'
    );
    // Check that bash completion instructions are shown
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('ark completion bash')
    );
  });

  it('outputs bash completion script', async () => {
    const command = createCompletionCommand({});
    await command.parseAsync(['node', 'test', 'bash']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('_ark_completion()')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('COMPREPLY')
    );
  });

  it('outputs zsh completion script', async () => {
    const command = createCompletionCommand({});
    await command.parseAsync(['node', 'test', 'zsh']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('#compdef ark')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('_ark()')
    );
  });
});
