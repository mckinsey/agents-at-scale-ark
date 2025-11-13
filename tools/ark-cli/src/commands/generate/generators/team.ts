import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs';
import {Generator, GeneratorOptions} from '../index.js';
import {TemplateEngine, TemplateVariables} from '../templateEngine.js';
import {TemplateDiscovery} from '../templateDiscovery.js';
import {toKebabCase, isValidKubernetesName} from '../utils/nameUtils.js';
import {
  validateCurrentProject,
  getCurrentProjectDirectory,
} from '../utils/projectUtils.js';

interface TeamConfig {
  name: string;
  teamName: string;
  projectName: string;
  projectDirectory: string;
  strategy: string;
  members: Array<{name: string; type: string}>;
  createQuery: boolean;
}

interface AgentInfo {
  name: string;
  fileName: string;
  path: string;
}

export function createTeamGenerator(): Generator {
  return {
    name: 'team',
    description: 'Generate a new team with selected agents',
    templatePath: 'templates/team',
    generate: async (
      name: string,
      destination: string,
      options: GeneratorOptions
    ) => {
      const generator = new TeamGenerator();
      await generator.generate(name, destination, options);
    },
  };
}

class TeamGenerator {
  private readonly templateDiscovery: TemplateDiscovery;
  private readonly templateEngine: TemplateEngine;

  constructor() {
    this.templateDiscovery = new TemplateDiscovery();
    this.templateEngine = new TemplateEngine();
  }

  /**
   * Discover existing agents in the project
   */
  private async discoverAgents(projectDir: string): Promise<AgentInfo[]> {
    const agentsDir = path.join(projectDir, 'agents');
    const agents: AgentInfo[] = [];

    if (!fs.existsSync(agentsDir)) {
      return agents;
    }

    const files = fs.readdirSync(agentsDir);
    for (const file of files) {
      if (file.endsWith('-agent.yaml') && file !== '.keep') {
        const filePath = path.join(agentsDir, file);
        const agentName = file.replace('-agent.yaml', '');

        agents.push({
          name: agentName,
          fileName: file,
          path: filePath,
        });
      }
    }

    return agents;
  }

  /**
   * Get team configuration from user input and validation
   */
  private async getTeamConfig(
    name: string,
    _destination: string,
    _options: GeneratorOptions
  ): Promise<TeamConfig> {
    // Validate that we're in a project directory
    const projectDir = getCurrentProjectDirectory();
    const validation = validateCurrentProject();

    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid project structure');
    }

    const projectName = validation.projectName || path.basename(projectDir);

    // Normalize team name
    const teamName = toKebabCase(name);

    if (!isValidKubernetesName(teamName)) {
      throw new Error(
        `Invalid team name: ${teamName}. Must be lowercase kebab-case`
      );
    }

    // Check if team already exists
    const teamsDir = path.join(projectDir, 'teams');
    const teamFilePath = path.join(teamsDir, `${teamName}-team.yaml`);

    if (fs.existsSync(teamFilePath)) {
      console.log(
        chalk.yellow(`⚠️  Team file already exists: ${teamFilePath}`)
      );

      const {overwrite} = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Do you want to overwrite the existing team?',
          default: false,
        },
      ]);

      if (!overwrite) {
        throw new Error('Team generation cancelled');
      }
    }

    // Discover existing agents
    const existingAgents = await this.discoverAgents(projectDir);

    // Select team strategy
    const {strategy} = await inquirer.prompt([
      {
        type: 'list',
        name: 'strategy',
        message: 'Select team strategy:',
        choices: [
          {name: 'Sequential - Agents execute in order', value: 'sequential'},
          {name: 'Round Robin - Agents take turns', value: 'round-robin'},
          {name: 'Graph - Custom workflow with dependencies', value: 'graph'},
          {
            name: 'Selector - AI chooses the next agent (can add graph constraints)',
            value: 'selector',
          },
        ],
        default: 'sequential',
      },
    ]);

    // Select agents for the team
    const teamMembers = await this.selectTeamMembers(
      existingAgents,
      projectName,
      projectDir
    );

    // Ask if user wants to create a query for the team
    const {createQuery} = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createQuery',
        message: `Would you like to create a sample query for the ${teamName} team?`,
        default: true,
      },
    ]);

    return {
      name,
      teamName,
      projectName,
      projectDirectory: projectDir,
      strategy,
      members: teamMembers,
      createQuery,
    };
  }

  /**
   * Build choices for existing agents
   */
  private buildExistingAgentChoices(
    existingAgents: AgentInfo[],
    members: Array<{name: string; type: string}>
  ): Array<{name: string; value: string; disabled?: boolean}> {
    if (existingAgents.length === 0) {
      return [];
    }

    const choices = [
      {
        name: '--- Select from existing agents ---',
        value: 'separator',
        disabled: true,
      },
    ];

    existingAgents.forEach((agent) => {
      const alreadySelected = members.some(
        (m) => m.name === `${agent.name}-agent`
      );
      choices.push({
        name: `${agent.name}-agent${alreadySelected ? ' (already selected)' : ''}`,
        value: `existing:${agent.name}`,
        disabled: alreadySelected,
      });
    });

    return choices;
  }

  /**
   * Build action choices for the member selection menu
   */
  private buildActionChoices(
    members: Array<{name: string; type: string}>
  ): Array<{name: string; value: string; disabled?: boolean}> {
    const choices = [
      {name: '--- Actions ---', value: 'separator', disabled: true},
      {name: '➕ Create a new agent', value: 'create-new'},
      {name: '✅ Done selecting members', value: 'done'},
    ];

    if (members.length > 0) {
      choices.push({name: '❌ Remove last member', value: 'remove-last'});
    }

    return choices;
  }

  /**
   * Handle different member selection actions
   */
  private async handleMemberAction(
    action: string,
    members: Array<{name: string; type: string}>,
    existingAgents: AgentInfo[],
    projectName: string,
    projectDir: string
  ): Promise<boolean> {
    if (action === 'done') {
      if (members.length === 0) {
        console.log(chalk.yellow('⚠️  A team must have at least one member'));
        return false; // Continue the loop
      }
      return true; // Exit the loop
    }

    if (action === 'remove-last') {
      const removed = members.pop();
      console.log(chalk.gray(`➖ Removed: ${removed?.name}`));
      return false; // Continue the loop
    }

    if (action === 'create-new') {
      const newAgent = await this.createNewAgent(projectName, projectDir);
      if (newAgent) {
        members.push({name: `${newAgent}-agent`, type: 'agent'});
        console.log(chalk.green(`➕ Added: ${newAgent}-agent`));

        // Refresh existing agents list
        const updatedAgents = await this.discoverAgents(projectDir);
        existingAgents.length = 0;
        existingAgents.push(...updatedAgents);
      }
      return false; // Continue the loop
    }

    if (action.startsWith('existing:')) {
      const agentName = action.replace('existing:', '');
      members.push({name: `${agentName}-agent`, type: 'agent'});
      console.log(chalk.green(`➕ Added: ${agentName}-agent`));
      return false; // Continue the loop
    }

    return false; // Continue the loop for unknown actions
  }

  /**
   * Interactive agent selection and creation
   */
  private async selectTeamMembers(
    existingAgents: AgentInfo[],
    projectName: string,
    projectDir: string
  ): Promise<Array<{name: string; type: string}>> {
    const members: Array<{name: string; type: string}> = [];

    while (true) {
      const existingChoices = this.buildExistingAgentChoices(
        existingAgents,
        members
      );
      const actionChoices = this.buildActionChoices(members);
      const choices = [...existingChoices, ...actionChoices];

      const {action} = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: `Select team members (${members.length} selected):`,
          choices,
        },
      ]);

      const shouldExit = await this.handleMemberAction(
        action,
        members,
        existingAgents,
        projectName,
        projectDir
      );

      if (shouldExit) {
        break;
      }
    }

    return members;
  }

  /**
   * Create a new agent using the agent generator
   */
  private async createNewAgent(
    projectName: string,
    projectDir: string
  ): Promise<string | null> {
    const {agentName} = await inquirer.prompt([
      {
        type: 'input',
        name: 'agentName',
        message: 'Enter the name for the new agent:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Agent name cannot be empty';
          }
          const normalizedName = toKebabCase(input);
          if (!isValidKubernetesName(normalizedName)) {
            return 'Agent name must be lowercase kebab-case';
          }
          return true;
        },
        filter: (input: string) => toKebabCase(input.trim()),
      },
    ]);

    try {
      // Use the template engine to create the agent
      const agentTemplateEngine = new TemplateEngine();
      const templatePath = this.templateDiscovery.getTemplatePath('agent');

      if (!this.templateDiscovery.templateExists('agent')) {
        throw new Error(`Agent template not found at: ${templatePath}`);
      }

      // Set up template variables
      const variables: TemplateVariables = {
        agentName,
        projectName,
      };

      agentTemplateEngine.setVariables(variables);

      // Process the agent template file
      const templateFilePath = path.join(templatePath, 'agent.template.yaml');
      const destinationFilePath = path.join(
        projectDir,
        'agents',
        `${agentName}-agent.yaml`
      );

      await agentTemplateEngine.processFile(
        templateFilePath,
        destinationFilePath
      );
      console.log(chalk.green(`📝 Created agent: ${agentName}-agent`));

      return agentName;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to create agent: ${error}`));
      return null;
    }
  }

  /**
   * Generate the team file
   */
  private async generateTeamFile(config: TeamConfig): Promise<void> {
    const templatePath = this.templateDiscovery.getTemplatePath('team');

    if (!this.templateDiscovery.templateExists('team')) {
      throw new Error(`Team template not found at: ${templatePath}`);
    }

    // For simple teams, use the first agent as the primary agent
    const primaryAgentName =
      config.members[0]?.name.replace('-agent', '') || 'default';

    // Set up template variables
    const variables: TemplateVariables = {
      teamName: config.teamName,
      projectName: config.projectName,
      agentName: primaryAgentName,
    };

    this.templateEngine.setVariables(variables);

    // Process the team template file
    const templateFilePath = path.join(templatePath, 'team.template.yaml');
    const destinationFilePath = path.join(
      config.projectDirectory,
      'teams',
      `${config.teamName}-team.yaml`
    );

    await this.templateEngine.processFile(
      templateFilePath,
      destinationFilePath
    );

    // Post-process the file to update members and strategy
    await this.updateTeamFile(destinationFilePath, config);
  }

  /**
   * Update the generated team file with selected members and strategy
   */
  private async updateTeamFile(
    filePath: string,
    config: TeamConfig
  ): Promise<void> {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Update strategy
    content = content.replace(
      /strategy: "sequential"/,
      `strategy: "${config.strategy}"`
    );

    // Update members section using safe line-based replacement to avoid regex backtracking DoS
    const lines = content.split('\n');
    const membersHeaderIndex = lines.findIndex((line) => {
      // Safe string-based check to avoid ReDoS vulnerability
      const trimmed = line.trim();
      return trimmed === 'members:';
    });

    if (membersHeaderIndex !== -1) {
      const baseIndentRegex = /^\s*/;
      const baseIndentMatch = baseIndentRegex.exec(lines[membersHeaderIndex]);
      const baseIndent = baseIndentMatch ? baseIndentMatch[0] : '';

      // Find the end of the current members block by scanning until a line with
      // indentation less than or equal to the base indent (i.e., next top-level key)
      let endIndex = membersHeaderIndex + 1;
      while (endIndex < lines.length) {
        const currentLine = lines[endIndex];
        // Always advance through empty lines inside the block
        if (currentLine.trim().length === 0) {
          endIndex++;
          continue;
        }
        const indentRegex = /^\s*/;
        const currentIndent = (indentRegex.exec(currentLine) || [''])[0];
        if (currentIndent.length <= baseIndent.length) {
          break;
        }
        endIndex++;
      }

      // Build the new members block with correct indentation derived from the file
      const memberIndent = baseIndent + '  ';
      const newMemberLines: string[] = [];
      for (const member of config.members) {
        newMemberLines.push(`${memberIndent}- name: ${member.name}`);
        newMemberLines.push(`${memberIndent}  type: ${member.type}`);
      }

      // Splice in the new block
      const replacement = newMemberLines.length > 0 ? newMemberLines : [];
      lines.splice(
        membersHeaderIndex + 1,
        Math.max(0, endIndex - (membersHeaderIndex + 1)),
        ...replacement
      );
      content = lines.join('\n');
    }

    fs.writeFileSync(filePath, content);
  }

  /**
   * Generate the query file for the team
   */
  private async generateQueryFile(config: TeamConfig): Promise<void> {
    const templatePath = this.templateDiscovery.getTemplatePath('query');

    if (!this.templateDiscovery.templateExists('query')) {
      throw new Error(`Query template not found at: ${templatePath}`);
    }

    // Set up template variables
    const variables: TemplateVariables = {
      queryName: config.teamName,
      targetType: 'team',
      targetName: config.teamName,
      projectName: config.projectName,
      inputMessage: `Hello! Can you help me understand what the ${config.teamName} team can do for the ${config.projectName} project?`,
    };

    this.templateEngine.setVariables(variables);

    // Process the query template file
    const templateFilePath = path.join(templatePath, 'query.template.yaml');
    const destinationFilePath = path.join(
      config.projectDirectory,
      'queries',
      `${config.teamName}-query.yaml`
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
    console.log(chalk.blue(`👥 ARK Team Generator\n`));

    try {
      // Get team configuration
      const config = await this.getTeamConfig(name, destination, options);

      console.log(chalk.cyan(`📋 Team Configuration:`));
      console.log(chalk.gray(`  Name: ${config.teamName}`));
      console.log(chalk.gray(`  Project: ${config.projectName}`));
      console.log(chalk.gray(`  Strategy: ${config.strategy}`));
      console.log(chalk.gray(`  Members: ${config.members.length} agent(s)`));
      config.members.forEach((member) => {
        console.log(chalk.gray(`    - ${member.name}`));
      });
      console.log(chalk.gray(`  Directory: ${config.projectDirectory}\n`));

      // Generate the team
      console.log(chalk.blue(`🔧 Generating team: ${config.teamName}`));
      await this.generateTeamFile(config);

      // Generate query if requested
      if (config.createQuery) {
        console.log(
          chalk.blue(`🔧 Generating query for team: ${config.teamName}`)
        );
        await this.generateQueryFile(config);
      }

      console.log(
        chalk.green(`\n✅ Successfully generated team: ${config.teamName}`)
      );
      console.log(chalk.gray(`📁 Created: teams/${config.teamName}-team.yaml`));

      if (config.createQuery) {
        console.log(
          chalk.gray(`📁 Created: queries/${config.teamName}-query.yaml`)
        );
      }

      // Show next steps
      console.log(chalk.cyan(`\n📋 Next Steps:`));
      console.log(
        chalk.gray(`  1. Review and customise the team configuration`)
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
        console.log(chalk.gray(`  4. Test with: kubectl get teams,queries`));
      } else {
        console.log(
          chalk.gray(
            `  2. Deploy with: helm upgrade --install ${config.projectName} . --namespace ${config.projectName}`
          )
        );
        console.log(chalk.gray(`  3. Test with: kubectl get teams`));
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Failed to generate team:`), error);
      throw error;
    }
  }
}
