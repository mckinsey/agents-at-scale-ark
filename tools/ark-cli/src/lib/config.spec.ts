import {jest} from '@jest/globals';
import path from 'path';
import os from 'os';

const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
};

jest.unstable_mockModule('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

const mockYaml = {
  parse: jest.fn(),
  stringify: jest.fn(),
};

jest.unstable_mockModule('yaml', () => ({
  default: mockYaml,
  ...mockYaml,
}));

const {loadConfig, getConfigPaths, formatConfig} = await import('./config.js');

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {...originalEnv};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default config when no files exist', () => {
    mockFs.existsSync.mockReturnValue(false);

    const config = loadConfig();

    expect(config).toEqual({
      chat: {
        streaming: true,
        outputFormat: 'text',
      },
    });
  });

  it('loads and merges configs in order: defaults, user, project', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync
      .mockReturnValueOnce('user yaml')
      .mockReturnValueOnce('project yaml');

    mockYaml.parse
      .mockReturnValueOnce({
        chat: {
          streaming: false,
          outputFormat: 'markdown',
        },
      })
      .mockReturnValueOnce({
        chat: {
          streaming: true,
        },
      });

    const config = loadConfig();

    expect(config.chat?.streaming).toBe(true);
    expect(config.chat?.outputFormat).toBe('markdown');
  });

  it('environment variables override all configs', () => {
    mockFs.existsSync.mockReturnValue(false);
    process.env.ARK_CHAT_STREAMING = '1';
    process.env.ARK_CHAT_OUTPUT_FORMAT = 'MARKDOWN';

    const config = loadConfig();

    expect(config.chat?.streaming).toBe(true);
    expect(config.chat?.outputFormat).toBe('markdown');
  });

  it('throws error for invalid YAML', () => {
    const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
    mockFs.existsSync.mockImplementation((path) => path === userConfigPath);
    mockFs.readFileSync.mockReturnValue('invalid yaml');
    mockYaml.parse.mockImplementation(() => {
      throw new Error('YAML parse error');
    });

    expect(() => loadConfig()).toThrow(
      `Invalid YAML in ${userConfigPath}: YAML parse error`
    );
  });

  it('handles non-Error exceptions', () => {
    const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
    mockFs.existsSync.mockImplementation((path) => path === userConfigPath);
    mockFs.readFileSync.mockReturnValue('invalid yaml');
    mockYaml.parse.mockImplementation(() => {
      throw 'string error';
    });

    expect(() => loadConfig()).toThrow(
      `Invalid YAML in ${userConfigPath}: Unknown error`
    );
  });

  it('getConfigPaths returns correct paths', () => {
    const paths = getConfigPaths();

    expect(paths.user).toBe(path.join(os.homedir(), '.arkrc.yaml'));
    expect(paths.project).toBe(path.join(process.cwd(), '.arkrc.yaml'));
  });

  it('formatConfig uses yaml.stringify', () => {
    const config = {chat: {streaming: true, outputFormat: 'text' as const}};
    mockYaml.stringify.mockReturnValue('formatted');

    const result = formatConfig(config);

    expect(mockYaml.stringify).toHaveBeenCalledWith(config);
    expect(result).toBe('formatted');
  });
});
