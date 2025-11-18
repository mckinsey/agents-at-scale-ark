import {Command} from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import {fileURLToPath} from 'url';
import type {ArkConfig} from '../../lib/config.js';
import {
  createProjectGenerator,
  createAgentGenerator,
  createTeamGenerator,
  createQueryGenerator,
  createMcpServerGenerator,
  createMarketplaceGenerator,
} from './generators/index.js';
import {
  normalizeAndValidateName,
  getNameValidationError,
} from './utils/nameUtils.js';
import {ErrorHandler, ArkError, ErrorCode} from '../../lib/errors.js';

export interface GeneratorOptions {
  name?: string;
  destination?: string;
  interactive?: boolean;

  // Project-specific options
  projectType?: string;
  namespace?: string;
  skipModels?: boolean;
  skipGit?: boolean;

  // Detailed configuration options
  selectedModels?: string;
  azureApiKey?: string;
  azureBaseUrl?: string;
  aigwBaseUrl?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  gitCreateCommit?: boolean;
}

export interface Generator {
  name: string;
  description: string;
  templatePath: string;
  generate(
    name: string,
    destination: string,
    options: GeneratorOptions
  ): Promise<void>;
}

function getDefaultDestination(): string {
  try {
    // Get the path to this file
    const currentFile = fileURLToPath(import.meta.url);

    // Navigate up from tools/ark-cli/src/commands/generate/index.js to agents-at-scale/
    const arkRoot = path.resolve(path.dirname(currentFile), '../../../../../');

    // Get the parent directory of agents-at-scale
    const parentDir = path.dirname(arkRoot);

    return parentDir;
  } catch (_error) {
    // Fallback to current working directory if we can't determine ark location
    console.warn(
      'Could not determine ark repository location, using current directory'
    );
    return process.cwd();
  }
}

export function createGenerateCommand(_: ArkConfig): Command {
  const generate = new Command('generate');
  generate
    .alias('g')
    .description(
      'Generate ARK resources from templates (projects, agents, teams, queries, mcp-servers, marketplace)'
    )
    .helpOption('-h, --help', 'Display help for the generate command')
    .addHelpText(
      'before',
      `
${chalk.blue('🎯 ARK Generator')}
Create new ARK resources quickly using interactive templates.

${chalk.cyan('Available generators:')}
  • project     - Complete ARK project with structure, CI/CD, and samples
  • agent       - Single AI agent definition
  • team        - Team of collaborative agents
  • query       - Query to test agents or teams
  • mcp-server  - MCP server with Kubernetes deployment
  • marketplace - Central repository for sharing reusable components
`
    )
    .addHelpText(
      'after',
      `
${chalk.cyan('Examples:')}
  ${chalk.yellow('ark g project')}                            # Create project with prompts
  ${chalk.yellow('ark g agent')}                              # Create an agent
  ${chalk.yellow('ark g team')}                               # Create a team
  ${chalk.yellow('ark g query')}                              # Create a query
  ${chalk.yellow('ark g mcp-server')}                         # Create MCP server
  ${chalk.yellow('ark g marketplace')}                        # Create marketplace
  
${chalk.cyan('Usage:')}
  Generators will prompt for required information when not provided via options.
  
${chalk.cyan('Getting started:')}
  1. ${chalk.yellow('ark generate project my-first-project')}  # Create project
  2. ${chalk.yellow('cd my-first-project')}                   # Enter directory
  3. ${chalk.yellow('source .env')}                          # Set environment
  4. ${chalk.yellow('devspace dev')}                         # Deploy to cluster
`
    );

  // Register generators
  const generators = new Map<string, Generator>();

  // Register built-in generators
  generators.set('project', createProjectGenerator());
  generators.set('agent', createAgentGenerator());
  generators.set('team', createTeamGenerator());
  generators.set('query', createQueryGenerator());
  generators.set('mcp-server', createMcpServerGenerator());
  generators.set('marketplace', createMarketplaceGenerator());

  // Add subcommands for each generator
  for (const [type, generator] of generators) {
    const subCommand = new Command(type);

    // Enhanced descriptions and help text per generator type
    const helpTexts = {
      project: {
        description: `${generator.description}

${chalk.cyan('Features:')}
  • Complete project structure with Helm charts
  • CI/CD pipeline with GitHub Actions  
  • Sample agents, teams, and queries
  • Model configurations for major providers
  • Security best practices and RBAC
  • Comprehensive documentation`,
        examples: `
${chalk.cyan('Examples:')}
  ${chalk.yellow(`ark g project`)}
  ${chalk.yellow(`ark generate project customer-service`)}
  
${chalk.cyan('Options:')}
  --project-type     Project type: 'empty' or 'with-samples' (default: with-samples)
  --namespace        Kubernetes namespace (default: project name)
  --skip-models      Skip model provider configuration
  --skip-git         Skip git repository initialization`,
      },
      agent: {
        description: `${generator.description}

${chalk.cyan('Features:')}
  • Creates agent YAML definition
  • Validates project structure
  • Optional query generation for testing
  • Handles name conflicts gracefully`,
        examples: `
${chalk.cyan('Examples:')}
  ${chalk.yellow(`ark generate agent customer-support`)}
  ${chalk.yellow(`ark g agent`)}
  
${chalk.cyan('Requirements:')}
  • Must be run within an ARK project directory
  • Project must have valid Chart.yaml and agents/ directory`,
      },
      team: {
        description: `${generator.description}

${chalk.cyan('Features:')}
  • Interactive agent selection
  • Multiple collaboration strategies
  • Can create new agents on-the-fly
  • Optional query generation for testing`,
        examples: `
${chalk.cyan('Examples:')}
  ${chalk.yellow(`ark generate team research-team`)}
  ${chalk.yellow(`ark g team support-escalation`)}
  
${chalk.cyan('Strategies:')}
  • sequential - Agents work in order
  • round-robin - Agents take turns
  • graph - Custom workflow with dependencies
  • selector - AI chooses the next agent`,
      },
      query: {
        description: `${generator.description}

${chalk.cyan('Features:')}
  • Interactive agent or team selection
  • Customisable input message
  • Automatic queries directory creation
  • Validates project structure`,
        examples: `
${chalk.cyan('Examples:')}
  ${chalk.yellow(`ark g query`)}
  ${chalk.yellow(`ark generate query user-interaction`)}
  
${chalk.cyan('Requirements:')}
  • Must be run within an ARK project directory
  • Target agent or team should exist (or will be created manually)`,
      },
      'mcp-server': {
        description: `${generator.description}

${chalk.cyan('Features:')}
  • Multi-technology support (Node.js, Deno, Go, Python)
  • Complete Kubernetes deployment with Helm charts
  • Docker containerization with mcp-proxy
  • Authentication and configuration options
  • Example agents and queries included
  • Production-ready with security best practices`,
        examples: `
${chalk.cyan('Examples:')}
  ${chalk.yellow(`ark g mcp-server`)}
  ${chalk.yellow(`ark generate mcp-server github-tools`)}
  
${chalk.cyan('Technologies:')}
  • node     - Node.js with NPM packages or local development
  • deno     - Deno with JSR packages or local development  
  • go       - Go with go install packages or local development
  • python   - Python with pip packages or local development
  
${chalk.cyan('Features:')}
  • Authentication support for secured APIs
  • Custom configuration for flexible deployment
  • Example agent and query generation
  • Kubernetes-native with MCPServer CRD integration`,
      },
      marketplace: {
        description: `${generator.description}

${chalk.cyan('Features:')}
  • Central repository structure for component sharing
  • Organized directories for all ARK component types
  • Built-in contribution guidelines and documentation
  • Git repository initialization with best practices
  • Ready for CI/CD integration and automated validation
  • Component templates for easy contribution`,
        examples: `
${chalk.cyan('Examples:')}
  ${chalk.yellow(`ark g marketplace`)}
  
${chalk.cyan('Structure:')}
  • agents/         - Reusable agent definitions
  • teams/          - Multi-agent workflow configurations
  • models/         - Model configurations by provider
  • queries/        - Query templates and patterns
  • tools/          - Tool definitions and implementations
  • mcp-servers/    - MCP server configurations
  • docs/           - Documentation and guides
  
${chalk.cyan('Use Cases:')}
  • Team sharing of proven agent configurations
  • Cross-project component libraries
  • Community marketplace for ARK resources
  • Internal organization component registry`,
      },
    };

    const helpText = helpTexts[type as keyof typeof helpTexts];

    subCommand
      .description(helpText?.description || generator.description)
      .argument(
        '[name]',
        type === 'marketplace'
          ? 'Ignored - marketplace is always named "ark-marketplace"'
          : `Name of the ${type} to generate`
      )
      .option(
        '-d, --destination <path>',
        type === 'project' || type === 'marketplace'
          ? 'Parent directory for the project (default: directory above ark)'
          : 'Working directory (default: current directory)',
        type === 'project' || type === 'marketplace'
          ? getDefaultDestination()
          : undefined
      )
      .option(
        '--no-interactive',
        type === 'marketplace'
          ? 'Not supported for marketplace'
          : 'Skip interactive prompts and use defaults (prompts by default)'
      );

    if (helpText?.examples) {
      subCommand.addHelpText('after', helpText.examples);
    }

    // Add project-specific options
    if (type === 'project') {
      subCommand
        .option(
          '-t, --project-type <type>',
          'Project type (empty or with-samples)'
        )
        .option(
          '-n, --namespace <namespace>',
          'Kubernetes namespace (defaults to project name)'
        )
        .option('--skip-models', 'Skip model configuration', false)
        .option('--skip-git', 'Skip git setup', false)
        .option(
          '--selected-models <models>',
          'Selected model configuration (default, aigw, all, none)'
        )
        .option('--azure-api-key <key>', 'Azure OpenAI API key')
        .option('--azure-base-url <url>', 'Azure OpenAI Base URL')
        .option('--aigw-base-url <url>', 'AI Gateway Base URL')
        .option('--git-user-name <name>', 'Git user name')
        .option('--git-user-email <email>', 'Git user email')
        .option('--git-create-commit', 'Create initial git commit', false);
    }

    subCommand.action(async (name: string, options: GeneratorOptions) => {
      await ErrorHandler.catchAndHandle(async () => {
        let itemName = name;
        let destination;
        if (options.destination) {
          destination = options.destination;
        } else if (type === 'project' || type === 'marketplace') {
          destination = getDefaultDestination();
        } else {
          destination = process.cwd();
        }

        // If no name provided or interactive mode, prompt for details
        // Special case: marketplace always uses "ark-marketplace"
        if (type === 'marketplace') {
          itemName = 'ark-marketplace';
        } else if (!itemName || options.interactive) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: `What name would you like to use for the ${type}?`,
              default: itemName,
              validate: (input: string) => {
                const error = getNameValidationError(input);
                return error || true;
              },
              filter: (input: string) => {
                try {
                  const {name} = normalizeAndValidateName(input, type);
                  return name;
                } catch {
                  return input; // Let validate handle the error
                }
              },
            },
            {
              type: 'input',
              name: 'destination',
              message: 'Where would you like to generate it?',
              default: destination,
              when: () => options.interactive && type === 'project',
            },
          ]);

          itemName = answers.name;
          if (answers.destination) {
            destination = answers.destination;
          }
        }

        // Validate the final name (skip for marketplace as it's fixed)
        if (!itemName && type !== 'marketplace') {
          throw new ArkError(
            `${type} name is required`,
            ErrorCode.INVALID_INPUT,
            undefined,
            [
              `Provide a name for the ${type}`,
              `Use: ark generate ${type} <name>`,
            ]
          );
        }

        // Normalize name if provided as argument (not already normalized via prompts)
        if (name && !options.interactive && type !== 'marketplace') {
          const {name: normalizedName, wasTransformed} =
            normalizeAndValidateName(itemName, type);
          if (wasTransformed) {
            console.log(
              chalk.yellow(
                `📝 Name normalized: "${itemName}" → "${normalizedName}"`
              )
            );
            itemName = normalizedName;
          }
        }

        console.log(chalk.blue(`\n🔧 Generating ${type}: ${itemName}`));
        console.log(chalk.gray(`📁 Project directory: ${destination}\n`));

        await generator.generate(itemName, destination, options);

        console.log(
          chalk.green(`\n✅ Successfully generated ${type}: ${itemName}`)
        );
      }, `Generating ${type}`).catch((error) =>
        ErrorHandler.handleAndExit(error)
      );
    });

    generate.addCommand(subCommand);
  }

  // Add a list command to show available generators
  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List available generators with detailed information')
    .option('--detailed', 'Show detailed information for each generator', false)
    .action((options) => {
      console.log(chalk.blue('\n🎯 ARK Generators\n'));

      for (const [type, generator] of generators) {
        const icon =
          type === 'project'
            ? '📦'
            : type === 'agent'
              ? '🤖'
              : type === 'team'
                ? '👥'
                : type === 'query'
                  ? '🔍'
                  : '❓';
        console.log(
          `${icon} ${chalk.green(type.padEnd(12))} ${chalk.gray(generator.description)}`
        );

        if (options.detailed) {
          const examples = {
            project: 'ark g project my-ai-project',
            agent: 'ark g agent customer-support',
            team: 'ark g team research-team',
            query: 'ark g query test-conversation',
          };
          console.log(
            chalk.gray(
              `    Example: ${examples[type as keyof typeof examples] || `ark g ${type} my-${type}`}\n`
            )
          );
        }
      }

      if (!options.detailed) {
        console.log(
          chalk.gray('\n💡 Use --detailed for examples and more information')
        );
      }

      console.log(chalk.cyan('\n📖 Quick Start:'));
      console.log(chalk.gray('  1. ark generate project my-first-project'));
      console.log(chalk.gray('  2. cd my-first-project && source .env'));
      console.log(chalk.gray('  3. devspace dev'));

      console.log(chalk.cyan('\n🔧 Usage:'));
      console.log(chalk.gray('  ark generate <type> [name] [options]'));
      console.log(chalk.gray('  ark g <type> [name] [options]'));
      console.log(chalk.gray('  ark generate <type> --help'));
      console.log();
    });

  generate.addCommand(listCommand);

  return generate;
}
