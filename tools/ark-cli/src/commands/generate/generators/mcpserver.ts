import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs';
import {TemplateEngine} from '../templateEngine.js';
import {TemplateDiscovery} from '../templateDiscovery.js';
import type {GeneratorOptions} from '../index.js';

export interface McpServerConfig {
  mcpServerName: string;
  description: string;
  technology: 'node' | 'deno' | 'go' | 'python';
  packageSource: 'local' | 'npm' | 'jsr' | 'go-install' | 'pip';
  packageName?: string;
  destination: string;
  requiresAuth: boolean;
  hasCustomConfig: boolean;
  maintainerName: string;
  homeUrl?: string;
  tools: Array<{name: string; description: string}>;
  packageManager: string;
  sourceUrls: string[];
  sampleQuery: string;
}

export function createMcpServerGenerator() {
  return {
    name: 'mcp-server',
    description:
      'Generate a new MCP server with Kubernetes deployment from template',
    templatePath: 'templates/mcp-server',
    generate: async (
      name: string,
      destination: string,
      options: GeneratorOptions
    ) => {
      const generator = new McpServerGenerator();
      await generator.generate(name, destination, options);
    },
  };
}

class McpServerGenerator {
  private readonly templateDiscovery: TemplateDiscovery;
  private readonly templateEngine: TemplateEngine;

  constructor() {
    this.templateDiscovery = new TemplateDiscovery();
    this.templateEngine = new TemplateEngine();
  }

  async generate(
    name: string,
    destination: string,
    _options: GeneratorOptions
  ): Promise<void> {
    console.log(chalk.blue('🚀 ARK MCP Server Generator\n'));

    // Get MCP server configuration
    const config = await this.getMcpServerConfig(name, destination);

    // Show summary and confirm
    await this.showSummaryAndConfirm(config);

    // Generate the MCP server
    await this.generateMcpServer(config);

    // Show next steps
    this.showNextSteps(config);
  }

  private async getMcpServerConfig(
    name: string,
    destination: string
  ): Promise<McpServerConfig> {
    console.log(chalk.cyan('📋 MCP Server Configuration\n'));

    // Determine if we're in a project context
    const isInProject = this.isInProjectContext(destination);
    const defaultDestination = isInProject
      ? path.join(destination, 'mcp-servers', name)
      : path.join(destination, name);

    const answers = await (inquirer as any).prompt([
      {
        type: 'input',
        name: 'mcpServerName',
        message: 'MCP server name:',
        default: name,
        validate: (input: string) => {
          if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
            return 'MCP server name can only contain letters, numbers, hyphens, and underscores';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'description',
        message: 'MCP server description:',
        default: `A custom MCP server named ${name} with Kubernetes deployment`,
      },
      {
        type: 'list',
        name: 'technology',
        message: 'Choose the technology stack:',
        choices: [
          {name: 'Node.js (JavaScript/TypeScript)', value: 'node'},
          {name: 'Deno (TypeScript)', value: 'deno'},
          {name: 'Go', value: 'go'},
          {name: 'Python', value: 'python'},
        ],
        default: 'node',
      },
      {
        type: 'list',
        name: 'packageSource',
        message: 'Package source:',
        choices: (answers: any) => {
          switch (answers.technology) {
            case 'node':
              return [
                {
                  name: 'Local development (custom implementation)',
                  value: 'local',
                },
                {name: 'NPM package', value: 'npm'},
              ];
            case 'deno':
              return [
                {
                  name: 'Local development (custom implementation)',
                  value: 'local',
                },
                {name: 'JSR package', value: 'jsr'},
              ];
            case 'go':
              return [
                {
                  name: 'Local development (custom implementation)',
                  value: 'local',
                },
                {name: 'Go install package', value: 'go-install'},
              ];
            case 'python':
              return [
                {
                  name: 'Local development (custom implementation)',
                  value: 'local',
                },
                {name: 'Pip package', value: 'pip'},
              ];
            default:
              return [{name: 'Local development', value: 'local'}];
          }
        },
        default: 'local',
      },
      {
        type: 'input',
        name: 'packageName',
        message: 'Package name (if using external package):',
        when: (answers: any) => answers.packageSource !== 'local',
        validate: (input: string, answers: any) => {
          if (answers.packageSource !== 'local' && !input.trim()) {
            return 'Package name is required when using external packages';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'destination',
        message: 'Destination directory:',
        default: defaultDestination,
      },
      {
        type: 'confirm',
        name: 'requiresAuth',
        message: 'Does this MCP server require authentication?',
        default: false,
      },
      {
        type: 'confirm',
        name: 'hasCustomConfig',
        message: 'Does this MCP server need custom configuration?',
        default: false,
      },
      {
        type: 'input',
        name: 'maintainerName',
        message: 'Maintainer name:',
        default: 'QBAF Team',
      },
      {
        type: 'input',
        name: 'homeUrl',
        message: 'Home URL (optional):',
        default: '',
      },
    ]);

    // Get tool definitions
    const tools = await this.getToolDefinitions();

    // Check if destination exists
    if (answers.destination && fs.existsSync(answers.destination)) {
      const overwrite = await inquirer.prompt<{overwrite: boolean}>([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Directory ${answers.destination} already exists. Overwrite?`,
          default: false,
        },
      ]);

      if (!overwrite.overwrite) {
        console.log(chalk.yellow('Operation cancelled.'));
        process.exit(0);
      }
    }

    return {
      mcpServerName: answers.mcpServerName || name,
      description: answers.description || '',
      technology: answers.technology || 'node',
      packageSource: answers.packageSource || 'local',
      packageName: answers.packageName,
      destination: answers.destination || defaultDestination,
      requiresAuth: answers.requiresAuth || false,
      hasCustomConfig: answers.hasCustomConfig || false,
      maintainerName: answers.maintainerName || '',
      homeUrl: answers.homeUrl,
      tools,
      packageManager: this.getPackageManager(answers.technology || 'node'),
      sourceUrls: answers.homeUrl ? [answers.homeUrl] : [],
      sampleQuery: this.generateSampleQuery(tools),
    };
  }

  private async getToolDefinitions(): Promise<
    Array<{name: string; description: string}>
  > {
    console.log(chalk.cyan('\n🔧 Tool Definitions\n'));
    console.log('Define the tools this MCP server will provide:');

    const tools: Array<{name: string; description: string}> = [];

    const addMore = await inquirer.prompt<{addTools: boolean}>([
      {
        type: 'confirm',
        name: 'addTools',
        message: 'Add tool definitions?',
        default: true,
      },
    ]);

    if (addMore.addTools) {
      let addingTools = true;

      while (addingTools) {
        const toolInfo = await inquirer.prompt<{
          name: string;
          description: string;
        }>([
          {
            type: 'input',
            name: 'name',
            message: 'Tool name:',
            validate: (input: string) => {
              if (!input.trim()) {
                return 'Tool name is required';
              }
              return true;
            },
          },
          {
            type: 'input',
            name: 'description',
            message: 'Tool description:',
            validate: (input: string) => {
              if (!input.trim()) {
                return 'Tool description is required';
              }
              return true;
            },
          },
        ]);

        tools.push(toolInfo);

        const continueAdding = await inquirer.prompt<{continue: boolean}>([
          {
            type: 'confirm',
            name: 'continue',
            message: 'Add another tool?',
            default: false,
          },
        ]);

        addingTools = continueAdding.continue;
      }
    }

    // Add default tool if none were added
    if (tools.length === 0) {
      tools.push({
        name: 'example_tool',
        description: 'An example tool provided by this MCP server',
      });
    }

    return tools;
  }

  private getPackageManager(technology: string): string {
    switch (technology) {
      case 'node':
        return 'npm';
      case 'deno':
        return 'deno';
      case 'python':
        return 'pip';
      case 'go':
        return 'go';
      default:
        return 'npm';
    }
  }

  private generateSampleQuery(
    tools: Array<{name: string; description: string}>
  ): string {
    if (tools.length === 0) return 'Test the MCP server functionality.';

    const toolNames = tools.map((t) => t.name).join(', ');
    return `Test the MCP server by using the available tools: ${toolNames}. Please demonstrate how each tool works.`;
  }

  private isInProjectContext(destination: string): boolean {
    // Check if we're in an ARK project by looking for common project files
    const projectMarkers = [
      'Makefile',
      'Chart.yaml',
      'agents/',
      'models/',
      'mcp-servers/',
    ];
    return projectMarkers.some((marker) =>
      fs.existsSync(path.join(destination, marker))
    );
  }

  private async showSummaryAndConfirm(config: McpServerConfig): Promise<void> {
    console.log(chalk.cyan('\n📋 Configuration Summary\n'));
    console.log(`MCP Server Name: ${chalk.green(config.mcpServerName)}`);
    console.log(`Description: ${config.description}`);
    console.log(`Technology: ${chalk.blue(config.technology)}`);
    console.log(`Package Source: ${config.packageSource}`);
    if (config.packageName) {
      console.log(`Package Name: ${config.packageName}`);
    }
    console.log(`Destination: ${config.destination}`);
    console.log(
      `Authentication: ${config.requiresAuth ? chalk.red('Required') : chalk.green('Not required')}`
    );
    console.log(
      `Custom Config: ${config.hasCustomConfig ? chalk.yellow('Yes') : 'No'}`
    );
    console.log(`Tools: ${config.tools.map((t) => t.name).join(', ')}`);

    const confirm = await inquirer.prompt<{proceed: boolean}>([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Generate MCP server with this configuration?',
        default: true,
      },
    ]);

    if (!confirm.proceed) {
      console.log(chalk.yellow('Operation cancelled.'));
      process.exit(0);
    }
  }

  private async generateMcpServer(config: McpServerConfig): Promise<void> {
    console.log(chalk.blue('\n🚀 Generating MCP Server...\n'));

    try {
      const templatePath = this.templateDiscovery.getTemplatePath('mcp-server');
      if (!templatePath) {
        throw new Error('MCP server template not found');
      }

      // Generate from template
      // Set template variables using the same structure expected by templates
      // Convert config to template variables format
      const templateVars: Record<string, string | number | boolean> = {};
      Object.entries(config).forEach(([key, value]) => {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          templateVars[key] = value;
        } else {
          templateVars[key] = JSON.stringify(value);
        }
      });
      this.templateEngine.setVariables(templateVars);
      await this.templateEngine.processTemplate(
        templatePath,
        config.destination
      );

      // Make build script executable (owner only for security)
      const buildScriptPath = path.join(config.destination, 'build.sh');
      if (fs.existsSync(buildScriptPath)) {
        fs.chmodSync(buildScriptPath, '700'); // rwx------ (owner only)
      }

      console.log(
        chalk.green(
          `✅ MCP server generated successfully at ${config.destination}`
        )
      );
    } catch (error) {
      console.error(
        chalk.red('Failed to generate MCP server:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  }

  private showNextSteps(config: McpServerConfig): void {
    console.log(chalk.cyan('\n🎯 Next Steps:\n'));
    console.log(`1. Navigate to your MCP server directory:`);
    console.log(chalk.yellow(`   cd ${config.destination}`));
    console.log(``);
    console.log(`2. Build the Docker image:`);
    console.log(chalk.yellow(`   make build`));
    console.log(``);
    console.log(`3. Install to Kubernetes:`);
    if (config.requiresAuth) {
      console.log(chalk.yellow(`   make install AUTH_TOKEN=your-auth-token`));
    } else {
      console.log(chalk.yellow(`   make install`));
    }
    console.log(``);
    console.log(`4. Check deployment status:`);
    console.log(chalk.yellow(`   make status`));
    console.log(``);
    console.log(`5. Deploy example agent and query:`);
    console.log(chalk.yellow(`   make deploy-examples`));
    console.log(``);
    console.log(chalk.green('🎉 Your MCP server is ready to use!'));
    console.log(``);
    console.log(
      'For more information, see the README.md file in your server directory.'
    );
  }
}
