import {vi} from 'vitest';
import {Command} from 'commander';

const mockLoadConfig = vi.fn() as any;
const mockGetConfigPaths = vi.fn() as any;
const mockFormatConfig = vi.fn() as any;

vi.mock('../../lib/config.js', () => ({
  loadConfig: mockLoadConfig,
  getConfigPaths: mockGetConfigPaths,
  formatConfig: mockFormatConfig,
}));

const mockExistsSync = vi.fn() as any;
vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
  },
  existsSync: mockExistsSync,
}));

const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

const {createConfigCommand} = await import('./index.js');

describe('config command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.ARK_CHAT_STREAMING;
    delete process.env.ARK_CHAT_OUTPUT_FORMAT;
  });

  it('creates command with correct structure', () => {
    const command = createConfigCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('config');
  });

  it('displays config paths and environment variables', async () => {
    const mockConfig = {defaultModel: 'test-model'};
    const mockPaths = {
      user: '/home/user/.arkrc.yaml',
      project: '/project/.arkrc.yaml',
    };

    mockLoadConfig.mockReturnValue(mockConfig);
    mockGetConfigPaths.mockReturnValue(mockPaths);
    mockFormatConfig.mockReturnValue('formatted config');
    mockExistsSync.mockReturnValue(true);

    const command = createConfigCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockGetConfigPaths).toHaveBeenCalled();
    expect(mockFormatConfig).toHaveBeenCalledWith(mockConfig);
    expect(mockExistsSync).toHaveBeenCalledWith(mockPaths.user);
    expect(mockExistsSync).toHaveBeenCalledWith(mockPaths.project);
  });

  it('shows when config files do not exist', async () => {
    const mockPaths = {
      user: '/home/user/.arkrc.yaml',
      project: '/project/.arkrc.yaml',
    };

    mockLoadConfig.mockReturnValue({});
    mockGetConfigPaths.mockReturnValue(mockPaths);
    mockFormatConfig.mockReturnValue('');
    mockExistsSync.mockReturnValue(false);

    const command = createConfigCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockExistsSync).toHaveBeenCalledWith(mockPaths.user);
    expect(mockExistsSync).toHaveBeenCalledWith(mockPaths.project);
    // Should show that files don't exist
    expect(mockConsoleLog).toHaveBeenCalled();
  });

  it('displays environment variables when set', async () => {
    process.env.ARK_CHAT_STREAMING = 'true';
    process.env.ARK_CHAT_OUTPUT_FORMAT = 'json';

    mockLoadConfig.mockReturnValue({});
    mockGetConfigPaths.mockReturnValue({user: '', project: ''});
    mockFormatConfig.mockReturnValue('');
    mockExistsSync.mockReturnValue(false);

    const command = createConfigCommand({});
    await command.parseAsync(['node', 'test']);

    // Should display the environment variables
    expect(mockConsoleLog).toHaveBeenCalled();
  });
});
