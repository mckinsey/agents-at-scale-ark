import {vi} from 'vitest';
import {Command} from 'commander';

const mockExeca = vi.fn() as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockOutput = {
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const {createImportCommand} = await import('./index.js');
import type {ArkConfig} from '../../lib/config.js';

describe('import command', () => {
  const mockConfig: ArkConfig = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create import command with correct description', () => {
    const command = createImportCommand(mockConfig);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('import');
    expect(command.description()).toBe('import ARK resources from a file');
  });

  it('should use kubectl to import', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: []}),
    });

    const command = createImportCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'test.yaml']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['create', '-f', 'test.yaml'],
      expect.any(Object)
    );
  });

  it('exits with error when kubectl create has error', async () => {
    mockExeca.mockRejectedValue('Import broke');

    const command = createImportCommand(mockConfig);

    await expect(
      command.parseAsync(['node', 'test', 'test.yaml'])
    ).rejects.toThrow('process.exit called');
    expect(mockOutput.error).toHaveBeenCalledWith(
      'import failed:',
      'Import broke'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('uses kubectl apply with --upsert', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      stdout: 'agent.ark.mckinsey.com/noah created',
      stderr: '',
    });

    const command = createImportCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'test.yaml', '--upsert']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['apply', '-f', 'test.yaml'],
      expect.objectContaining({reject: false})
    );
  });

  it('summarizes created, configured and unchanged resources with --upsert', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      stdout: [
        'tool.ark.mckinsey.com/noop created',
        'agent.ark.mckinsey.com/noah configured',
        'secret/default-model-secret configured',
        'model.ark.mckinsey.com/default unchanged',
      ].join('\n'),
      stderr: '',
    });

    const command = createImportCommand(mockConfig);
    await command.parseAsync(['node', 'test', 'test.yaml', '--upsert']);

    expect(mockOutput.success).toHaveBeenCalledWith(
      'import complete: 1 created, 2 configured, 1 unchanged'
    );
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('reports failures and exits 1 with --upsert', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 1,
      stdout: 'agent.ark.mckinsey.com/noah configured',
      stderr:
        'Error from server (Invalid): error when creating "test.yaml": bad spec',
    });

    const command = createImportCommand(mockConfig);

    await expect(
      command.parseAsync(['node', 'test', 'test.yaml', '--upsert'])
    ).rejects.toThrow('process.exit called');
    expect(mockOutput.error).toHaveBeenCalledWith(
      'import completed with errors: 0 created, 1 configured, 0 unchanged, 1 failed'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
