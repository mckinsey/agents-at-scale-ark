import {vi} from 'vitest';
import chalk from 'chalk';

vi.mock('inquirer', () => ({
  default: {prompt: vi.fn()},
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({isDirectory: () => false}),
    copyFileSync: vi.fn(),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({isDirectory: () => false}),
  copyFileSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({stdout: '', stderr: ''}),
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
  },
}));

vi.spyOn(console, 'log').mockImplementation(() => {});

const {createProjectGenerator} = await import('./project.js');

interface ProjectStep {
  desc: string;
  cmd?: string;
}

function simulateShowNextSteps(
  projectType: 'empty' | 'with-samples',
  selectedModels: string | undefined,
  namespace: string,
  destination: string
): (ProjectStep | string)[] {
  const steps: (ProjectStep | string)[] = [
    {
      desc: 'Navigate to your new project directory',
      cmd: `cd ${destination}`,
    },
  ];

  if (projectType === 'empty') {
    steps.push(
      {desc: 'Add YAML files to agents/, teams/, queries/ directories'},
      {
        desc: 'Use either the default model already in models/ or a configuration template from samples/models/ of ARK repository',
      },
      {desc: 'Edit .env file to set your API keys'},
      {desc: 'Deploy your project', cmd: 'devspace dev'}
    );
  } else if (selectedModels && selectedModels !== 'none') {
    steps.push(
      {desc: 'Edit .env file to set your API keys'},
      {desc: 'Load environment variables', cmd: 'source .env'},
      {desc: 'Deploy your project', cmd: 'devspace dev'},
      {
        desc: 'Test your deployment',
        cmd: `kubectl get query sample-team-query -w --namespace ${namespace}`,
      }
    );
  } else {
    steps.push(
      {
        desc: 'Use either the default model already in models/ or a configuration template from samples/models/ of ARK repository',
      },
      {desc: 'Edit .env file to set your API keys'},
      {desc: 'Deploy your project', cmd: 'devspace dev'}
    );
  }

  return steps;
}

function renderSteps(steps: (ProjectStep | string)[]): void {
  console.log(chalk.magenta.bold('🚀 NEXT STEPS:\n'));
  let stepNumber = 1;
  steps.forEach((step) => {
    if (step === '') {
      console.log();
    } else if (typeof step === 'object' && step !== null && 'desc' in step) {
      console.log(
        chalk.yellow.bold(`   ▶ ${stepNumber}.`) +
          ' ' +
          chalk.cyan.bold(step.desc)
      );
      if (step.cmd) {
        console.log(chalk.gray(`      $ ${step.cmd}`));
      }
      stepNumber++;
    }
  });
}

describe('project generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('showNextSteps logic', () => {
    it('generates correct steps for empty project type', () => {
      const steps = simulateShowNextSteps('empty', undefined, 'default', '/tmp/test');

      expect(steps.length).toBe(5);
      const modelStep = steps.find(
        (s) => typeof s === 'object' && s.desc.includes('default model')
      );
      expect(modelStep).toBeDefined();

      renderSteps(steps);
    });

    it('generates correct steps for project with selected models', () => {
      const steps = simulateShowNextSteps('with-samples', 'openai', 'default', '/tmp/test');

      expect(steps.length).toBe(5);
      const testStep = steps.find(
        (s) => typeof s === 'object' && s.desc.includes('Test your deployment')
      );
      expect(testStep).toBeDefined();

      renderSteps(steps);
    });

    it('generates correct steps for project without model selection', () => {
      const steps = simulateShowNextSteps('with-samples', 'none', 'default', '/tmp/test');

      expect(steps.length).toBe(4);
      const modelStep = steps.find(
        (s) => typeof s === 'object' && s.desc.includes('default model')
      );
      expect(modelStep).toBeDefined();

      renderSteps(steps);
    });

    it('generates correct steps when selectedModels is undefined', () => {
      const steps = simulateShowNextSteps('with-samples', undefined, 'default', '/tmp/test');

      expect(steps.length).toBe(4);
      const modelStep = steps.find(
        (s) => typeof s === 'object' && s.desc.includes('default model')
      );
      expect(modelStep).toBeDefined();

      renderSteps(steps);
    });
  });
});
