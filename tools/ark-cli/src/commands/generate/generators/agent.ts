import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs';
import {Generator, GeneratorOptions} from '../index.js';
import {TemplateEngine, TemplateVariables} from '../templateEngine.js';
import {TemplateDiscovery} from '../templateDiscovery.js';
import {toKebabCase, validateNameStrict} from '../utils/nameUtils.js';
import {getCurrentProjectInfo} from '../utils/projectUtils.js';
import {
  ErrorHandler,
  TemplateError,
  ValidationError,
} from '../../../lib/errors.js';

interface AgentConfig {
  name: string;
  agentName: string;
  projectName: string;
  projectDirectory: string;
  createQuery: boolean;
}

export function createAgentGenerator(): Generator {
  return {
    name: 'agent',
    description: 'Generate a new agent in the current project',
    templatePath: 'templates/agent',
    generate: async (
      name: string,
      destination: string,
      options: GeneratorOptions
    ) => {
      const generator = new AgentGenerator();
      await generator.generate(name, destination, options);
    },
  };
}

class AgentGenerator {
  private templateDiscovery: TemplateDiscovery;
  private templateEngine: TemplateEngine;

  constructor() {
    this.templateDiscovery = new TemplateDiscovery();
    this.templateEngine = new TemplateEngine();
  }

  /**
   * Get agent configuration from user input and validation
   */
  private async getAgentConfig(
    name: string,
    _destination: string,
    _options: GeneratorOptions
  ): Promise<AgentConfig> {
    // Validate that we're in a project directory and get project info
    const {projectName, projectDir} = getCurrentProjectInfo();

    // Validate and normalize agent name
    const agentName = toKebabCase(name);
    validateNameStrict(agentName, 'agent name');

    // Check if agent already exists
    const agentsDir = path.join(projectDir, 'agents');
    const agentFilePath = path.join(agentsDir, `${agentName}-agent.yaml`);

    if (fs.existsSync(agentFilePath)) {
      console.log(
        chalk.yellow(`⚠️  Agent file already exists: ${agentFilePath}`)
      );

      const {overwrite} = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Do you want to overwrite the existing agent?',
          default: false,
        },
      ]);

      if (!overwrite) {
        throw new ValidationError(
          'Agent generation cancelled by user',
          'overwrite',
          [
            `Use a different agent name`,
            `Use --force flag to overwrite without prompting`,
          ]
        );
      }
    }

    // Ask if user wants to create a query for the agent
    const {createQuery} = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createQuery',
        message: `Would you like to create a sample query for the ${agentName} agent?`,
        default: true,
      },
    ]);

    return {
      name,
      agentName,
      projectName,
      projectDirectory: projectDir,
      createQuery,
    };
  }

  /**
   * Generate the query file for the agent
   */
  private async generateQueryFile(config: AgentConfig): Promise<void> {
    const templatePath = this.templateDiscovery.getTemplatePath('query');

    if (!this.templateDiscovery.templateExists('query')) {
      throw new Error(`Query template not found at: ${templatePath}`);
    }

    // Set up template variables
    const variables: TemplateVariables = {
      queryName: config.agentName,
      targetType: 'agent',
      targetName: config.agentName,
      projectName: config.projectName,
      inputMessage: `Hello! Can you help me understand what you can do for the ${config.projectName} project?`,
    };

    this.templateEngine.setVariables(variables);

    // Process the query template file
    const templateFilePath = path.join(templatePath, 'query.template.yaml');
    const destinationFilePath = path.join(
      config.projectDirectory,
      'queries',
      `${config.agentName}-query.yaml`
    );

    await this.templateEngine.processFile(
      templateFilePath,
      destinationFilePath
    );
  }

  /**
   * Generate the agent file
   */
  private async generateAgentFile(config: AgentConfig): Promise<void> {
    const templatePath = this.templateDiscovery.getTemplatePath('agent');

    if (!this.templateDiscovery.templateExists('agent')) {
      throw new TemplateError(
        `Agent template not found at: ${templatePath}`,
        templatePath,
        [
          'Ensure the templates directory exists',
          'Check that the agent template is properly installed',
          'Verify file permissions',
        ]
      );
    }

    // Set up template variables
    const variables: TemplateVariables = {
      agentName: config.agentName,
      projectName: config.projectName,
    };

    this.templateEngine.setVariables(variables);

    // Process the agent template file
    const templateFilePath = path.join(templatePath, 'agent.template.yaml');
    const destinationFilePath = path.join(
      config.projectDirectory,
      'agents',
      `${config.agentName}-agent.yaml`
    );

    await this.templateEngine.processFile(
      templateFilePath,
      destinationFilePath
    );
  }

  /**
   * Main generate method
   */
  async generate(
    name: string,
    destination: string,
    options: GeneratorOptions
  ): Promise<void> {
    return ErrorHandler.catchAndHandle(async () => {
      console.log(chalk.blue(`🤖 ARK Agent Generator\n`));

      // Get agent configuration
      const config = await this.getAgentConfig(name, destination, options);

      console.log(chalk.cyan(`📋 Agent Configuration:`));
      console.log(chalk.gray(`  Name: ${config.agentName}`));
      console.log(chalk.gray(`  Project: ${config.projectName}`));
      console.log(chalk.gray(`  Directory: ${config.projectDirectory}\n`));

      // Generate the agent
      console.log(chalk.blue(`🔧 Generating agent: ${config.agentName}`));
      await this.generateAgentFile(config);

      // Generate query if requested
      if (config.createQuery) {
        console.log(
          chalk.blue(`🔧 Generating query for agent: ${config.agentName}`)
        );
        await this.generateQueryFile(config);
      }

      console.log(
        chalk.green(`\n✅ Successfully generated agent: ${config.agentName}`)
      );
      console.log(
        chalk.gray(`📁 Created: agents/${config.agentName}-agent.yaml`)
      );

      if (config.createQuery) {
        console.log(
          chalk.gray(`📁 Created: queries/${config.agentName}-query.yaml`)
        );
      }

      // Show next steps
      console.log(chalk.cyan(`\n📋 Next Steps:`));
      console.log(
        chalk.gray(`  1. Review and customise the agent configuration`)
      );
      if (config.createQuery) {
        console.log(
          chalk.gray(`  2. Review and customise the query configuration`)
        );
        console.log(
          chalk.gray(
            `  3. Deploy with: helm upgrade --install ${config.projectName} . --namespace ${config.projectName}`
          )
        );
        console.log(chalk.gray(`  4. Test with: kubectl get agents,queries`));
      } else {
        console.log(
          chalk.gray(
            `  2. Deploy with: helm upgrade --install ${config.projectName} . --namespace ${config.projectName}`
          )
        );
        console.log(chalk.gray(`  3. Test with: kubectl get agents`));
      }
    }, 'Generating agent');
  }
}
