import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs';
import {execa} from 'execa';
import {Generator, GeneratorOptions} from '../index.js';
import {TemplateEngine, TemplateVariables} from '../templateEngine.js';
import {TemplateDiscovery} from '../templateDiscovery.js';
import {
  toKebabCase,
  validateNameStrict,
  isValidKubernetesName,
} from '../utils/nameUtils.js';
import {
  getInquirerProjectTypeChoices,
  GENERATOR_DEFAULTS,
  CLI_CONFIG,
} from '../config.js';
import {SecurityUtils} from '../../../lib/security.js';
import ora from 'ora';

interface ProjectConfig {
  name: string;
  namespace: string;
  destination: string;
  projectType: 'empty' | 'with-samples';
  selectedModels: string;
  initGit: boolean;
  configureModels: boolean;
  createCommit: boolean;
  gitUserName?: string;
  gitUserEmail?: string;
}

interface ProjectStep {
  desc: string;
  cmd?: string;
}

interface ModelInfo {
  name: string;
  envVars: string[];
  description: string;
}

interface ModelEnvConfig {
  apiKey: string;
  baseUrl?: string;
  defaultBaseUrl?: string;
  additionalVars?: {
    name: string;
    defaultValue?: string;
    description?: string;
  }[];
}

export function createProjectGenerator(): Generator {
  return {
    name: 'project',
    description: 'Generate a new agent project from template',
    templatePath: 'templates/project',
    generate: async (
      name: string,
      destination: string,
      options: GeneratorOptions
    ) => {
      const generator = new ProjectGenerator();
      await generator.generate(name, destination, options);
    },
  };
}

class ProjectGenerator {
  private templateDiscovery: TemplateDiscovery;
  private templateEngine: TemplateEngine;
  private samplesPath: string;

  constructor() {
    this.templateDiscovery = new TemplateDiscovery();
    this.templateEngine = new TemplateEngine();

    // Get path to samples directory
    const templatesPath = this.templateDiscovery.getTemplatePath('');
    this.samplesPath = path.resolve(templatesPath, '../samples');
  }

  private async isGitAvailable(): Promise<boolean> {
    try {
      await execa('git', ['--version'], {stdio: 'ignore'});
      return true;
    } catch {
      return false;
    }
  }

  async generate(
    name: string,
    destination: string,
    options: GeneratorOptions
  ): Promise<void> {
    console.log(chalk.blue(`\n🚀 ARK Agent Project Generator\n`));
    const spinner = ora('Checking prerequisites').start();

    try {
      // Check prerequisites
      await this.checkPrerequisites();
      spinner.succeed('Prerequisites validated');

      // Get project configuration
      spinner.start('Gathering project configuration');
      const config = await this.getProjectConfig(
        name,
        destination,
        options,
        spinner
      );
      spinner.succeed(`Project "${config.name}" configured`);

      // Discover and configure models (only if not skipped)
      if (config.configureModels) {
        spinner.start('Configuring model providers');
        await this.configureModels(config);
        spinner.succeed(`Model provider: ${config.selectedModels || 'none'}`);
      }

      // Configure git if requested (only if not skipped)
      if (config.initGit) {
        spinner.start('Setting up git repository');
        await this.configureGit(config);
        spinner.succeed('Git repository configured');
      }

      // Generate the project
      spinner.start('Generating project files');
      await this.generateProject(config);
      spinner.succeed('Project files created');

      // Finalize
      spinner.start('Finalizing project setup');
      this.showNextSteps(config);
      spinner.succeed('Project ready');

      console.log(chalk.green(`\n✅ Project generation completed\n`));
    } catch (error) {
      spinner.fail(
        `Failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  private async checkPrerequisites(): Promise<void> {
    const requirements = [];

    // Check for git (required for project initialization if git is enabled)
    try {
      await execa('git', ['--version'], {stdio: 'ignore'});
      requirements.push({tool: 'git', available: true, required: false});
    } catch {
      requirements.push({tool: 'git', available: false, required: false});
      console.log(
        chalk.yellow(
          '⚠️  Warning: Git not found - git features will be disabled'
        )
      );
    }

    // Check for deployment tools (optional for project generation)
    const deploymentTools = ['kubectl', 'helm'];
    const missingDeploymentTools: string[] = [];

    for (const tool of deploymentTools) {
      try {
        await execa(tool, ['--version'], {stdio: 'ignore'});
        requirements.push({tool, available: true, required: false});
      } catch {
        requirements.push({tool, available: false, required: false});
        missingDeploymentTools.push(tool);
      }
    }

    if (missingDeploymentTools.length > 0) {
      console.log(
        chalk.blue(
          `ℹ️  Optional tools not found: ${missingDeploymentTools.join(', ')}`
        )
      );
      console.log(
        chalk.cyan(
          '💡 Tip: Install kubectl and helm later to deploy your project to a cluster'
        )
      );
    }
  }

  private async getProjectConfig(
    name: string,
    destination: string,
    options: GeneratorOptions,
    spinner: any
  ): Promise<ProjectConfig> {
    // Use command line options if provided
    let projectType = options.projectType;
    let parentDir = destination;
    let namespace = options.namespace;

    // Validate project type if provided
    if (
      projectType &&
      projectType !== 'empty' &&
      projectType !== 'with-samples'
    ) {
      throw new Error(
        `Invalid project type: ${projectType}. Must be 'empty' or 'with-samples'`
      );
    }

    // Default to interactive mode unless all required options are provided
    // or explicitly set to non-interactive
    const shouldPrompt =
      options.interactive !== false &&
      (!options.projectType || !options.namespace);

    if (shouldPrompt) {
      // Stop spinner before showing prompts
      spinner.stop();

      // Show configuration header only when prompting
      console.log(chalk.gray(`\n${'─'.repeat(50)}`));
      console.log(chalk.cyan('Project Configuration'));
      console.log(chalk.gray(`${'─'.repeat(50)}\n`));

      const prompts = [];

      if (!options.projectType) {
        prompts.push({
          ...CLI_CONFIG.prompts.projectType,
          choices: getInquirerProjectTypeChoices(),
        });
      }

      if (!destination) {
        prompts.push({
          ...CLI_CONFIG.prompts.parentDir,
          default: destination,
        });
      }

      if (!options.namespace) {
        prompts.push({
          ...CLI_CONFIG.prompts.namespace,
          default: GENERATOR_DEFAULTS.getDefaultNamespace(name),
          validate: (input: string) => {
            const trimmed = input.trim();
            if (!trimmed) {
              return 'Namespace cannot be empty';
            }

            if (!isValidKubernetesName(trimmed)) {
              const suggested = toKebabCase(trimmed);
              return `Namespace must be lowercase kebab-case (suggested: "${suggested}")`;
            }

            return true;
          },
          filter: (input: string) => toKebabCase(input),
        });
      }

      if (prompts.length > 0) {
        const answers = await inquirer.prompt(prompts);
        projectType = answers.projectType || projectType;
        parentDir = answers.parentDir || parentDir;
        namespace = answers.namespace || namespace;
      }

      // Restart spinner after prompts
      spinner.start('Finalizing configuration');
    }

    // Use defaults for missing options
    if (!projectType) {
      projectType = GENERATOR_DEFAULTS.projectType; // 'with-samples'
    }

    if (!namespace) {
      namespace = name; // Default namespace to project name
    }

    // Validate and normalize namespace
    namespace = toKebabCase(namespace);
    validateNameStrict(namespace, 'namespace');

    const projectPath = path.join(parentDir, name);

    // Check if directory exists
    if (fs.existsSync(projectPath)) {
      const overwrite = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Directory ${projectPath} already exists. Remove and continue?`,
          default: false,
        },
      ]);

      if (overwrite.overwrite) {
        fs.rmSync(projectPath, {recursive: true, force: true});
        console.log(chalk.green('✅ Removed existing directory'));
      } else {
        throw new Error('Project creation cancelled');
      }
    }

    return {
      name: name,
      namespace,
      destination: projectPath,
      projectType: projectType as 'empty' | 'with-samples',
      selectedModels: options.selectedModels || '',
      initGit: !options.skipGit,
      configureModels: !options.skipModels,
      createCommit: options.gitCreateCommit || false,
      gitUserName: options.gitUserName,
      gitUserEmail: options.gitUserEmail,
    };
  }

  private async configureModels(config: ProjectConfig): Promise<void> {
    console.log(chalk.cyan('📋 Model Provider Configuration\n'));

    // Skip model configuration for empty projects
    if (config.projectType === 'empty') {
      console.log(
        chalk.gray('⏭️  Skipping model configuration (empty project)')
      );
      config.selectedModels = 'none';
      return;
    }

    // If models already configured via command line, skip interactive prompts
    if (config.selectedModels && config.selectedModels !== '') {
      console.log(
        chalk.green(`✅ Using pre-configured model: ${config.selectedModels}`)
      );
      return;
    }

    const models = await this.discoverModels();

    if (models.length === 0) {
      console.log(chalk.yellow('⚠️ No models found in samples/models/'));
      config.selectedModels = '';
      return;
    }

    console.log('Select which model configurations to include:\n');

    // Show available models
    const choices = models.map((model, index) => ({
      name: `${model.name} - ${model.description}${index === 0 ? ' (recommended)' : ''}`,
      value: model.name,
      short: model.name,
    }));

    choices.push(
      {name: 'All models (copy everything)', value: 'all', short: 'all'},
      {
        name: 'Skip for now (configure manually later)',
        value: 'none',
        short: 'none',
      }
    );

    const modelAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedModel',
        message: 'Choose model configuration:',
        choices,
        default: models[0]?.name || 'none',
      },
    ]);

    config.selectedModels = modelAnswer.selectedModel;
  }

  private async discoverModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    const modelsPath = path.join(this.samplesPath, 'models');

    if (!fs.existsSync(modelsPath)) {
      return models;
    }

    const modelFiles = fs
      .readdirSync(modelsPath)
      .filter((file) => file.endsWith('.yaml'))
      .sort((a, b) => {
        // Put 'default' first
        if (a === 'default.yaml') return -1;
        if (b === 'default.yaml') return 1;
        return a.localeCompare(b);
      });

    for (const file of modelFiles) {
      const modelPath = path.join(modelsPath, file);
      const content = fs.readFileSync(modelPath, 'utf-8');

      const name = path.basename(file, '.yaml');
      const envVars = this.extractEnvVars(content);
      const description = this.getModelDescription(name, content);

      models.push({name, envVars, description});
    }

    return models;
  }

  private extractEnvVars(content: string): string[] {
    const matches = content.match(/\$\{([^}]+)\}/g) || [];
    return [...new Set(matches.map((match) => match.slice(2, -1)))];
  }

  private getModelEnvConfigs(): Record<string, ModelEnvConfig> {
    return {
      default: {
        apiKey: 'AZURE_API_KEY',
        baseUrl: 'AZURE_BASE_URL',
        defaultBaseUrl: 'https://your-resource.openai.azure.com',
        additionalVars: [
          {
            name: 'AZURE_API_VERSION',
            defaultValue: '2024-12-01-preview',
            description: 'Azure OpenAI API version',
          },
        ],
      },
      claude: {
        apiKey: 'CLAUDE_API_KEY',
        baseUrl: 'CLAUDE_BASE_URL',
        defaultBaseUrl: 'https://api.anthropic.com/v1/',
      },
      openai: {
        apiKey: 'OPENAI_API_KEY',
        baseUrl: 'OPENAI_BASE_URL',
        defaultBaseUrl: 'https://api.openai.com/v1',
      },
      gemini: {
        apiKey: 'GEMINI_API_KEY',
        baseUrl: 'GEMINI_BASE_URL',
        defaultBaseUrl:
          'https://generativelanguage.googleapis.com/v1beta/openai/',
      },
      azure: {
        apiKey: 'AZURE_API_KEY',
        baseUrl: 'AZURE_BASE_URL',
        defaultBaseUrl: 'https://your-resource.openai.azure.com',
        additionalVars: [
          {
            name: 'AZURE_API_VERSION',
            defaultValue: '2024-12-01-preview',
            description: 'Azure OpenAI API version',
          },
        ],
      },
    };
  }

  private getModelDescription(name: string, content: string): string {
    // Extract description from comments or use defaults
    const commentMatch = content.match(/^#\s*(.+)/m);
    if (commentMatch && !commentMatch[1].includes('Make sure to use')) {
      return commentMatch[1];
    }

    // Fallback descriptions
    const descriptions: {[key: string]: string} = {
      default: 'Azure OpenAI (recommended for quick start)',
      claude: 'Anthropic Claude via OpenAI API',
      gemini: 'Google Gemini via OpenAI API',
      aigw: 'AI Gateway (managed platform)',
    };

    return descriptions[name] || `Model: ${name}`;
  }

  private async configureGit(config: ProjectConfig): Promise<void> {
    // If git setup is explicitly skipped, don't do anything
    if (!config.initGit) {
      return;
    }

    // Check if git is available
    const gitAvailable = await this.isGitAvailable();

    if (!gitAvailable) {
      console.log(
        chalk.yellow('⚠️  Git not available - skipping git configuration')
      );
      config.initGit = false;
      return;
    }

    // Check if git is configured (only if we're initializing git)
    try {
      await execa('git', ['config', 'user.name'], {stdio: 'pipe'});
      await execa('git', ['config', 'user.email'], {stdio: 'pipe'});
    } catch {
      console.log(
        chalk.yellow(
          '⚠️  Git user not configured. Run: git config --global user.name "Your Name" && git config --global user.email "your.email@example.com"'
        )
      );
    }

    // Since initGit is already true from command line options or defaults,
    // we can proceed without prompting
    config.createCommit = true; // Always create commit if initializing git
  }

  private async generateProject(config: ProjectConfig): Promise<void> {
    console.log(chalk.cyan(CLI_CONFIG.messages.generatingProject));

    // Set template variables
    const variables: TemplateVariables = {
      projectName: config.name,
      namespace: config.namespace,
      PROJECT_NAME: config.name,
      NAMESPACE: config.namespace,
      authorName: config.gitUserName || 'Your Team',
      authorEmail: config.gitUserEmail || 'your-team@example.com',
      projectType: config.projectType,
    };

    this.templateEngine.setVariables(variables);

    // Copy template
    const templatePath = this.templateDiscovery.getTemplatePath('project');

    // Configure exclude patterns (no sample files since they're now dynamic)
    const excludePatterns = ['.git', 'node_modules', '.DS_Store'];

    await this.templateEngine.processTemplate(
      templatePath,
      config.destination,
      {
        createDirectories: true,
        exclude: excludePatterns,
      }
    );

    // Copy sample templates if 'with-samples' project type
    if (config.projectType === 'with-samples') {
      await this.copySampleTemplates(config);
    }

    // Copy models if selected
    if (config.selectedModels && config.selectedModels !== 'none') {
      await this.copyModelsFromTemplates(config);
    }

    // Clean up .keep files from directories that now have content
    await this.cleanupKeepFiles(config);

    // Create .env file
    await this.createEnvFile(config);

    // Setup git if requested
    if (config.initGit) {
      await this.setupGit(config);
    }

    // Show a clean summary
    console.log(chalk.green('\n✅ Project structure created'));
    if (config.projectType === 'with-samples') {
      console.log(chalk.green('✅ Sample agents, teams, and queries added'));
    }
    if (config.selectedModels && config.selectedModels !== 'none') {
      console.log(chalk.green('✅ Model configuration added'));
    }
    console.log(chalk.green('✅ Environment file created'));
    if (config.initGit) {
      console.log(chalk.green('✅ Git repository initialized'));
    }
  }

  private async copyModelsFromTemplates(config: ProjectConfig): Promise<void> {
    const modelsDestination = path.join(config.destination, 'models');

    // Ensure models directory exists
    if (!fs.existsSync(modelsDestination)) {
      fs.mkdirSync(modelsDestination, {recursive: true});
    }

    // Clear existing models (except .keep)
    const existingFiles = fs.readdirSync(modelsDestination);
    for (const file of existingFiles) {
      if (file.endsWith('.yaml')) {
        fs.unlinkSync(path.join(modelsDestination, file));
      }
    }

    // Map "default" to "azure" for template type
    let templateType = config.selectedModels;
    if (templateType === 'default') {
      templateType = 'azure';
    }

    // Copy specific model template, always named "default"
    await this.copyModelFromTemplate(config, 'default', templateType);
  }

  private async copySampleTemplates(config: ProjectConfig): Promise<void> {
    console.log(chalk.blue('📄 Adding sample content...'));

    // Temporarily set sample variables
    const originalVariables = this.templateEngine.getVariables();
    const templatesBasePath = this.templateDiscovery.getTemplatePath('');

    // Generate agent and team samples first
    const basicSampleTypes = ['agent', 'team'];

    for (const sampleType of basicSampleTypes) {
      try {
        // Set sample-specific template variables
        const sampleVariables: TemplateVariables = {
          ...this.templateEngine.getVariables(),
          agentName: 'sample',
          teamName: 'sample',
          modelName: 'default', // Use 'default' for sample model
        };

        this.templateEngine.setVariables(sampleVariables);

        const sampleTemplatePath = path.join(templatesBasePath, sampleType);

        // Check if the sample template directory exists
        if (!fs.existsSync(sampleTemplatePath)) {
          console.log(
            chalk.yellow(`⚠️  Sample template not found: ${sampleType}`)
          );
          continue;
        }

        // Get the destination directory for this sample type (with proper pluralization)
        const pluralMap: Record<string, string> = {
          agent: 'agents',
          team: 'teams',
          query: 'queries',
          model: 'models',
        };
        const destinationDir = path.join(
          config.destination,
          pluralMap[sampleType] || `${sampleType}s`
        );

        // Ensure destination directory exists
        if (!fs.existsSync(destinationDir)) {
          fs.mkdirSync(destinationDir, {recursive: true});
        }

        // Process all template files in this sample type directory
        await this.templateEngine.processTemplate(
          sampleTemplatePath,
          destinationDir,
          {
            createDirectories: false, // We already created the directory
          }
        );
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️  Failed to copy sample ${sampleType}: ${error}`)
        );
      }
    }

    // Generate sample queries for both agent and team
    await this.copySampleQueries(config, templatesBasePath);

    // Restore original variables
    this.templateEngine.setVariables(originalVariables);

    // Handle sample model separately - only if no models were configured
    if (!config.selectedModels || config.selectedModels === 'none') {
      await this.copySampleModel(config);
    }
  }

  private async copySampleQueries(
    config: ProjectConfig,
    templatesBasePath: string
  ): Promise<void> {
    try {
      const queryTemplatePath = path.join(templatesBasePath, 'query');

      // Check if the query template directory exists
      if (!fs.existsSync(queryTemplatePath)) {
        console.log(chalk.yellow(`⚠️  Sample template not found: query`));
        return;
      }

      const queriesDir = path.join(config.destination, 'queries');

      // Ensure queries directory exists
      if (!fs.existsSync(queriesDir)) {
        fs.mkdirSync(queriesDir, {recursive: true});
      }

      // Generate query for agent
      const agentQueryVariables: TemplateVariables = {
        ...this.templateEngine.getVariables(),
        queryName: 'sample-agent',
        targetType: 'agent',
        targetName: 'sample',
        inputMessage: `Hello! Can you help me understand what you can do for the ${this.templateEngine.getVariables().projectName || 'sample'} project?`,
      };

      this.templateEngine.setVariables(agentQueryVariables);
      await this.templateEngine.processTemplate(queryTemplatePath, queriesDir, {
        createDirectories: false,
      });

      // Generate query for team
      const teamQueryVariables: TemplateVariables = {
        ...this.templateEngine.getVariables(),
        queryName: 'sample-team',
        targetType: 'team',
        targetName: 'sample',
        inputMessage: `Hello team! Can you collaborate to help me understand how you work together for the ${this.templateEngine.getVariables().projectName || 'sample'} project?`,
      };

      this.templateEngine.setVariables(teamQueryVariables);
      await this.templateEngine.processTemplate(queryTemplatePath, queriesDir, {
        createDirectories: false,
      });
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Failed to copy sample queries: ${error}`));
    }
  }

  private async copySampleModel(config: ProjectConfig): Promise<void> {
    await this.copyModelFromTemplate(config, 'default', 'azure');
  }

  private async copyModelFromTemplate(
    config: ProjectConfig,
    modelName: string,
    templateType: string
  ): Promise<void> {
    try {
      // Set model-specific template variables
      const modelVariables: TemplateVariables = {
        ...this.templateEngine.getVariables(),
        modelName: modelName,
      };

      // Temporarily set model variables
      const originalVariables = this.templateEngine.getVariables();
      this.templateEngine.setVariables(modelVariables);

      const templatesBasePath = this.templateDiscovery.getTemplatePath('');
      const modelTemplatePath = path.join(
        templatesBasePath,
        'models',
        `${templateType}.yaml`
      );

      if (!fs.existsSync(modelTemplatePath)) {
        console.log(
          chalk.yellow(`⚠️  Model template not found: ${templateType}`)
        );
        return;
      }

      const modelsDestination = path.join(config.destination, 'models');

      // Ensure models directory exists
      if (!fs.existsSync(modelsDestination)) {
        fs.mkdirSync(modelsDestination, {recursive: true});
      }

      // Process the specific model template
      const outputFileName = `${modelName}.yaml`;
      const outputPath = path.join(modelsDestination, outputFileName);

      await this.templateEngine.processFile(modelTemplatePath, outputPath, {
        skipIfExists: false,
        baseDir: config.destination,
      });

      // Restore original variables
      this.templateEngine.setVariables(originalVariables);
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Failed to copy model template: ${error}`));
    }
  }

  private async cleanupKeepFiles(config: ProjectConfig): Promise<void> {
    // Directories that might contain .keep files
    const directoriesToCheck = [
      'agents',
      'teams',
      'queries',
      'models',
      'docs',
      'tools',
      'tests/unit',
      'tests/e2e',
    ];

    for (const dirPath of directoriesToCheck) {
      const fullDirPath = path.join(config.destination, dirPath);

      // Skip if directory doesn't exist
      if (!fs.existsSync(fullDirPath)) {
        continue;
      }

      try {
        const files = fs.readdirSync(fullDirPath);
        const keepFile = path.join(fullDirPath, '.keep');

        // Check if .keep file exists and there are other files
        const hasKeepFile = files.includes('.keep');
        const hasOtherFiles = files.some((file) => file !== '.keep');

        if (hasKeepFile && hasOtherFiles) {
          fs.unlinkSync(keepFile);
        }
      } catch (error) {
        // Log but don't fail the generation if we can't clean up a .keep file
        console.log(
          chalk.yellow(
            `⚠️  Could not clean up .keep file in ${dirPath}: ${error}`
          )
        );
      }
    }
  }

  private async createEnvFile(config: ProjectConfig): Promise<void> {
    const envPath = path.join(config.destination, '.env');

    // Validate and sanitize project values
    const sanitizedName = SecurityUtils.sanitizeEnvironmentValue(
      config.name,
      'PROJECT_NAME'
    );
    const sanitizedNamespace = SecurityUtils.sanitizeEnvironmentValue(
      config.namespace,
      'NAMESPACE'
    );

    // Generate dynamic environment content based on selected models
    let envContent = `# Project Configuration
# Generated by ARK CLI - Do not edit the project values below
PROJECT_NAME=${sanitizedName}
NAMESPACE=${sanitizedNamespace}

# Model Configuration (used for environment variable substitution in model YAML files)
# Security Note: Keep these keys secret and never commit them to version control

`;

    // Get model environment configurations
    const modelEnvConfigs = this.getModelEnvConfigs();

    // Determine which models to include
    let modelsToInclude: string[] = [];

    if (config.selectedModels === 'all') {
      modelsToInclude = Object.keys(modelEnvConfigs);
    } else if (config.selectedModels && config.selectedModels !== 'none') {
      modelsToInclude = [config.selectedModels];
    }

    // Generate environment variables for selected models
    if (modelsToInclude.length > 0) {
      for (const modelName of modelsToInclude) {
        const modelConfig = modelEnvConfigs[modelName];
        if (!modelConfig) continue;

        envContent += `# ${modelName.charAt(0).toUpperCase() + modelName.slice(1)} Configuration\n`;

        // API Key (if applicable)
        if (modelConfig.apiKey) {
          envContent += `${modelConfig.apiKey}="your-${modelName}-api-key-here"\n`;
        }

        // Base URL (if applicable)
        if (modelConfig.baseUrl && modelConfig.defaultBaseUrl) {
          envContent += `${modelConfig.baseUrl}="${modelConfig.defaultBaseUrl}"\n`;
        }

        // Additional variables
        if (modelConfig.additionalVars) {
          for (const additionalVar of modelConfig.additionalVars) {
            const value = additionalVar.defaultValue
              ? `"${additionalVar.defaultValue}"`
              : `"your-${additionalVar.name.toLowerCase().replace(/_/g, '-')}-here"`;
            envContent += `${additionalVar.name}=${value}`;
            if (additionalVar.description) {
              envContent += ` # ${additionalVar.description}`;
            }
            envContent += '\n';
          }
        }

        envContent += '\n';
      }
    } else {
      // If no models selected, show commented examples
      envContent += `# Uncomment and configure the appropriate environment variables for your model provider:

# Default/Azure Configuration
# AZURE_API_KEY="your-azure-api-key-here"
# AZURE_BASE_URL="https://your-resource.openai.azure.com"
# AZURE_API_VERSION="2024-12-01-preview"

# Claude Configuration
# CLAUDE_API_KEY="your-claude-api-key-here"
# CLAUDE_BASE_URL="https://api.anthropic.com/v1/"

# OpenAI Configuration  
# OPENAI_API_KEY="your-openai-api-key-here"
# OPENAI_BASE_URL="https://api.openai.com/v1"

# Gemini Configuration
# GEMINI_API_KEY="your-gemini-api-key-here"
# GEMINI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"

`;
    }

    envContent += `# Additional configuration
# DEBUG=false
# LOG_LEVEL=info
`;

    // Write file securely
    await SecurityUtils.writeFileSafe(envPath, envContent, config.destination);
    console.log(chalk.green(`📝 Created environment file: ${envPath}`));
    console.log(
      chalk.yellow(
        `⚠️  Remember to set your API keys in ${path.basename(envPath)}`
      )
    );
  }

  private async setupGit(config: ProjectConfig): Promise<void> {
    // Double-check git availability
    const gitAvailable = await this.isGitAvailable();
    if (!gitAvailable) {
      console.log(chalk.yellow('⚠️  Git not available - skipping git setup'));
      return;
    }

    console.log(chalk.cyan('📋 Setting up git repository...'));

    const cwd = config.destination;

    // Initialize git
    await execa('git', ['init'], {cwd});

    // Add files
    await execa('git', ['add', '.'], {cwd});

    // Create initial commit if requested
    if (config.createCommit) {
      const commitMessage = `Initial commit from agents-at-scale template

Project: ${config.name}
Model Provider: ${config.selectedModels}
Namespace: ${config.namespace}

Generated with ARK CLI generator`;

      await execa('git', ['commit', '-m', commitMessage], {cwd});
      console.log(chalk.green('✅ Created initial git commit'));
    }
  }

  private showNextSteps(config: ProjectConfig): void {
    // Large, prominent success message
    console.log(chalk.green('\n🎉 Project Created Successfully!\n'));
    console.log(chalk.cyan(`📁 ${config.destination}\n`));

    // Show next steps based on project type
    const steps: (ProjectStep | string)[] = [
      {
        desc: 'Navigate to your new project directory',
        cmd: `cd ${config.destination}`,
      },
    ];

    if (config.projectType === 'empty') {
      steps.push(
        {desc: 'Add YAML files to agents/, teams/, queries/ directories'},
        {desc: 'Copy model configurations from samples/models/'},
        {desc: 'Edit .env file to set your API keys'},
        {desc: 'Deploy your project', cmd: 'devspace dev'}
      );
    } else if (config.selectedModels && config.selectedModels !== 'none') {
      steps.push(
        {desc: 'Edit .env file to set your API keys'},
        {desc: 'Load environment variables', cmd: 'source .env'},
        {desc: 'Deploy your project', cmd: 'devspace dev'},
        {
          desc: 'Test your deployment',
          cmd: `kubectl get query sample-team-query -w --namespace ${config.namespace}`,
        }
      );
    } else {
      steps.push(
        {desc: 'Copy model configurations from samples/models/'},
        {desc: 'Edit .env file to set your API keys'},
        {desc: 'Deploy your project', cmd: 'devspace dev'}
      );
    }

    console.log(chalk.magenta.bold('🚀 NEXT STEPS:\n'));
    let stepNumber = 1;
    steps.forEach((step) => {
      if (step === '') {
        console.log(); // Empty line for separation
      } else if (typeof step === 'string' && step.startsWith('•')) {
        // Skip the bullet points - we'll handle commands separately
      } else if (typeof step === 'object' && step !== null && 'desc' in step) {
        // Handle step objects with description and optional command
        console.log(
          chalk.yellow.bold(`   ▶ ${stepNumber}.`) +
            ' ' +
            chalk.cyan.bold(step.desc)
        );
        if (step.cmd) {
          console.log(chalk.yellow(`      ${step.cmd}`));
        }
        console.log(); // Add space between steps
        stepNumber++;
      } else if (typeof step === 'string') {
        // Handle old string format
        console.log(
          chalk.yellow.bold(`   ▶ ${stepNumber}.`) +
            ' ' +
            chalk.cyan.bold(step)
        );
        console.log(); // Add space between steps
        stepNumber++;
      }
    });

    console.log(chalk.green('\n🚀 Happy building with Agents at Scale!\n'));
  }
}
