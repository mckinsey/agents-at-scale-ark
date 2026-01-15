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
      marketplace: {
        repoUrl: 'https://github.com/mckinsey/agents-at-scale-marketplace',
        registry: 'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts',
      },
      services: {
        reusePortForwards: false,
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

  it('loads queryTimeout from config file', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('yaml');
    mockYaml.parse.mockReturnValue({queryTimeout: '30m'});

    const config = loadConfig();

    expect(config.queryTimeout).toBe('30m');
  });

  it('loads defaultExportTypes from config file', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('yaml');
    mockYaml.parse.mockReturnValue({defaultExportTypes: ['agents', 'teams']});

    const config = loadConfig();
    expect(config.defaultExportTypes).toEqual(['agents', 'teams']);
  });

  it('ARK_QUERY_TIMEOUT environment variable overrides config', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('yaml');
    mockYaml.parse.mockReturnValue({queryTimeout: '5m'});
    process.env.ARK_QUERY_TIMEOUT = '1h';

    const config = loadConfig();

    expect(config.queryTimeout).toBe('1h');
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

  it('loads marketplace config from config file', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('yaml');
    mockYaml.parse.mockReturnValue({
      marketplace: {
        repoUrl: 'https://example.com/my-marketplace',
        registry: 'oci://example.com/charts',
      },
    });

    const config = loadConfig();

    expect(config.marketplace?.repoUrl).toBe(
      'https://example.com/my-marketplace'
    );
    expect(config.marketplace?.registry).toBe('oci://example.com/charts');
  });

  it('marketplace environment variables override config', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('yaml');
    mockYaml.parse.mockReturnValue({
      marketplace: {
        repoUrl: 'https://example.com/my-marketplace',
        registry: 'oci://example.com/charts',
      },
    });
    process.env.ARK_MARKETPLACE_REPO_URL = 'https://custom.com/marketplace';
    process.env.ARK_MARKETPLACE_REGISTRY = 'oci://custom.com/charts';

    const config = loadConfig();

    expect(config.marketplace?.repoUrl).toBe('https://custom.com/marketplace');
    expect(config.marketplace?.registry).toBe('oci://custom.com/charts');
  });
});

describe('marketplace helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {...originalEnv};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('getMarketplaceRepoUrl returns custom config value', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('yaml');
    mockYaml.parse.mockReturnValue({
      marketplace: {
        repoUrl: 'https://custom-repo.com/marketplace',
      },
    });

    jest.resetModules();
    const {getMarketplaceRepoUrl} = await import('./config.js');

    expect(getMarketplaceRepoUrl()).toBe('https://custom-repo.com/marketplace');
  });

  it('getMarketplaceRepoUrl returns default value', async () => {
    mockFs.existsSync.mockReturnValue(false);

    jest.resetModules();
    const {getMarketplaceRepoUrl} = await import('./config.js');

    expect(getMarketplaceRepoUrl()).toBe(
      'https://github.com/mckinsey/agents-at-scale-marketplace'
    );
  });

  it('getMarketplaceRegistry returns custom config value', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('yaml');
    mockYaml.parse.mockReturnValue({
      marketplace: {
        registry: 'oci://custom-registry.com/charts',
      },
    });

    jest.resetModules();
    const {getMarketplaceRegistry} = await import('./config.js');

    expect(getMarketplaceRegistry()).toBe('oci://custom-registry.com/charts');
  });

  it('getMarketplaceRegistry returns default value', async () => {
    mockFs.existsSync.mockReturnValue(false);

    jest.resetModules();
    const {getMarketplaceRegistry} = await import('./config.js');

    expect(getMarketplaceRegistry()).toBe(
      'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts'
    );
  });
});
