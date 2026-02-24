import {vi} from 'vitest';
import {Command} from 'commander';

const mockCreateGetCommand = vi.fn();
vi.mock('./get.js', () => ({
  createGetCommand: mockCreateGetCommand,
}));

const {createClusterCommand} = await import('./index.js');

describe('cluster command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateGetCommand.mockReturnValue(new Command('get'));
  });

  it('creates command with correct structure', () => {
    const command = createClusterCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('cluster');
  });

  it('adds get subcommand', () => {
    const command = createClusterCommand({});

    expect(mockCreateGetCommand).toHaveBeenCalled();
    const getCommand = command.commands.find((cmd) => cmd.name() === 'get');
    expect(getCommand).toBeDefined();
  });
});
