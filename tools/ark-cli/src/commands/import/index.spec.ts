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
});
