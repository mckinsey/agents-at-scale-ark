import {vi} from 'vitest';

const mockPrompt = vi.fn();
vi.mock('inquirer', () => ({
  default: {prompt: mockPrompt},
}));

const mockFs = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({isDirectory: () => false}),
  copyFileSync: vi.fn(),
  rmSync: vi.fn(),
};
vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

const mockExeca = vi.fn();
vi.mock('execa', () => ({
  execa: mockExeca,
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('../templateEngine.js', () => ({
  TemplateEngine: vi.fn().mockImplementation(() => ({
    processDirectory: vi.fn(),
    processFile: vi.fn(),
    setVariables: vi.fn(),
    getVariables: vi.fn().mockReturnValue({}),
    processTemplate: vi.fn().mockResolvedValue(undefined),
    processString: vi.fn().mockImplementation((str: string) => str),
  })),
}));

vi.mock('../templateDiscovery.js', () => ({
  TemplateDiscovery: vi.fn().mockImplementation(() => ({
    findTemplate: vi.fn().mockResolvedValue('/templates/project'),
    listTemplates: vi.fn().mockResolvedValue([]),
    getTemplatePath: vi.fn().mockReturnValue('/templates'),
  })),
}));

vi.mock('../../../lib/security.js', () => ({
  SecurityUtils: {
    validatePath: vi.fn(),
    sanitizeEnvironmentValue: vi.fn().mockImplementation((value: string) => value),
    sanitizeEnvFileContent: vi.fn().mockImplementation((content: string) => content),
    writeFileSafe: vi.fn().mockResolvedValue(undefined),
    validateEnvironmentFile: vi.fn(),
  },
}));

const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

const {createProjectGenerator} = await import('./project.js');

describe('project generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readdirSync.mockReturnValue([]);
    mockExeca.mockResolvedValue({stdout: '', stderr: ''});
  });

  describe('createProjectGenerator', () => {
    it('returns a generator with correct name and description', () => {
      const generator = createProjectGenerator();

      expect(generator.name).toBe('project');
      expect(generator.description).toBe('Generate a new agent project from template');
      expect(generator.templatePath).toBe('templates/project');
    });

    it('has a generate function', () => {
      const generator = createProjectGenerator();

      expect(typeof generator.generate).toBe('function');
    });
  });

  describe('generate with showNextSteps', () => {
    it('shows next steps for empty project type', async () => {
      mockPrompt
        .mockResolvedValueOnce({projectType: 'empty', namespace: 'test-ns'})
        .mockResolvedValueOnce({initGit: false});

      mockFs.existsSync.mockReturnValue(false);

      const generator = createProjectGenerator();

      await generator.generate('test-project', '/tmp', {});

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCalls = mockConsoleLog.mock.calls.flat().join(' ');
      expect(logCalls).toContain('NEXT STEPS');
    });

    it('shows next steps for project with selected models', async () => {
      mockPrompt
        .mockResolvedValueOnce({projectType: 'with-samples', namespace: 'test-ns'})
        .mockResolvedValueOnce({configureModels: true})
        .mockResolvedValueOnce({selectedModels: 'openai'})
        .mockResolvedValueOnce({OPENAI_API_KEY: 'test-key'})
        .mockResolvedValueOnce({initGit: false});

      mockFs.existsSync.mockReturnValue(false);

      const generator = createProjectGenerator();

      await generator.generate('test-project', '/tmp', {});

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCalls = mockConsoleLog.mock.calls.flat().join(' ');
      expect(logCalls).toContain('NEXT STEPS');
    });

    it('shows next steps for project without model selection', async () => {
      mockPrompt
        .mockResolvedValueOnce({projectType: 'with-samples', namespace: 'test-ns'})
        .mockResolvedValueOnce({configureModels: false})
        .mockResolvedValueOnce({initGit: false});

      mockFs.existsSync.mockReturnValue(false);

      const generator = createProjectGenerator();

      await generator.generate('test-project', '/tmp', {});

      expect(mockConsoleLog).toHaveBeenCalled();
      const logCalls = mockConsoleLog.mock.calls.flat().join(' ');
      expect(logCalls).toContain('NEXT STEPS');
    });
  });
});
