/**
 * Shared configuration for generators across CLI and UI
 */

import path from 'path';

export interface ProjectTypeChoice {
  value: 'empty' | 'with-samples';
  label: string;
  shortLabel?: string;
  description?: string;
  icon?: string;
  recommended?: boolean;
}

export interface GeneratorChoice {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface GeneratorDefaults {
  projectType: 'empty' | 'with-samples';
  skipModels: boolean;
  skipGit: boolean;
  getDefaultDestination: () => string;
  getDefaultNamespace: (projectName: string) => string;
}

/**
 * Project type choices - shared between CLI and UI
 */
export const PROJECT_TYPE_CHOICES: ProjectTypeChoice[] = [
  {
    value: 'with-samples',
    label: 'Project with samples (recommended for getting started)',
    shortLabel: 'with-samples',
    description:
      'Includes sample agents, teams, models, and queries to get you started',
    icon: '🎯',
    recommended: true,
  },
  {
    value: 'empty',
    label: 'Empty project (just the structure)',
    shortLabel: 'empty',
    description: 'Just the directory structure and configuration files',
    icon: '📁',
    recommended: false,
  },
];

/**
 * Available generator types - shared between CLI and UI
 */
export const GENERATOR_CHOICES: GeneratorChoice[] = [
  {
    value: 'project',
    label: 'Project - Generate a new agent project',
    description:
      'Create a complete ARK agent project with all necessary files and structure',
    icon: '📦',
  },
  {
    value: 'agent',
    label: 'Agent - Generate a single agent',
    description: 'Create a new agent definition in the current project',
    icon: '🤖',
  },
  {
    value: 'team',
    label: 'Team - Generate a team with multiple agents',
    description:
      'Create a team configuration with selected agents and strategy',
    icon: '👥',
  },
  {
    value: 'query',
    label: 'Query - Generate a query to test agents or teams',
    description: 'Create a query definition to test and interact with agents',
    icon: '❓',
  },
  {
    value: 'mcp-server',
    label: 'MCP Server - Generate an MCP server with Kubernetes deployment',
    description:
      'Create an MCP server with Docker image and Kubernetes deployment configuration',
    icon: '🔌',
  },
  {
    value: 'marketplace',
    label: 'Marketplace - Generate a marketplace repository',
    description:
      'Create a central repository for sharing reusable ARK components',
    icon: '🏪',
  },
];

/**
 * Default configuration values with config manager integration
 */
export const GENERATOR_DEFAULTS: GeneratorDefaults = {
  get projectType(): ProjectTypeChoice['value'] {
    return 'with-samples';
  },
  get skipModels() {
    return false;
  },
  get skipGit() {
    return false;
  },
  getDefaultDestination: () => {
    try {
      // Return current working directory as default
      const configured = null;
      if (configured && configured !== process.cwd()) {
        return configured;
      }
    } catch {
      // Fall through to default logic
    }

    try {
      // Get the path relative to this config file
      // This file is at: tools/ark-cli/src/commands/generate/config.ts
      // We want to go up to agents-at-scale and then to its parent
      const configFileDir = new URL('.', import.meta.url).pathname;
      const arkRoot = path.resolve(configFileDir, '../../../../../');
      const parentDir = path.dirname(arkRoot);
      return parentDir;
    } catch (_error) {
      // Fallback to current working directory if we can't determine ark location
      return process.cwd();
    }
  },
  getDefaultNamespace: (projectName: string) => projectName,
};

/**
 * Validation constants
 */
export const VALIDATION_CONSTANTS = {
  MAX_NAME_LENGTH: 63,
  MIN_NAME_LENGTH: 1,
  NAME_PATTERN: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
} as const;

/**
 * UI-specific configurations
 */
export const UI_CONFIG = {
  // Text and messages
  messages: {
    projectNamePrompt: 'Enter a name for your new agent project:',
    projectTypePrompt: 'Choose project type:',
    generatorTypePrompt: "Choose what you'd like to generate:",
    nameTooLong: (max: number) => `Name must be ${max} characters or less`,
    nameEmpty: 'Name cannot be empty',
    nameInvalid: (suggested: string) =>
      `Name must be lowercase kebab-case (suggested: "${suggested}")`,
    generationComplete: 'Project Generated Successfully!',
    generationFailed: 'Generation Failed',
  },

  // Step navigation
  steps: {
    generatorType: 'generator-type',
    projectName: 'project-name',
    projectConfig: 'project-config',
    generating: 'generating',
    complete: 'complete',
    error: 'error',
  } as const,

  // Icons and colors
  colors: {
    primary: 'cyan',
    success: 'green',
    error: 'red',
    warning: 'yellow',
    secondary: 'gray',
  } as const,

  icons: {
    generator: '🎯',
    project: '📦',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    folder: '📁',
    rocket: '🚀',
  } as const,
} as const;

/**
 * CLI-specific configurations
 */
export const CLI_CONFIG = {
  // Inquirer prompt configurations
  prompts: {
    projectType: {
      type: 'list' as const,
      name: 'projectType',
      message: 'Project type:',
      default: GENERATOR_DEFAULTS.projectType,
    },

    parentDir: {
      type: 'input' as const,
      name: 'parentDir',
      message: 'Parent directory for project:',
      filter: (input: string) => input.replace(/^~/, process.env.HOME || '~'),
    },

    namespace: {
      type: 'input' as const,
      name: 'namespace',
      message: 'Kubernetes namespace:',
    },
  },

  // Console messages
  messages: {
    banner: '🚀 ARK Agent Project Generator',
    checkingPrerequisites: '📋 Checking prerequisites...',
    projectConfiguration: '📋 Project Configuration',
    generatingProject: '📋 Generating project...',
    projectGenerated: '✅ Project generated successfully',
  },
} as const;

/**
 * Get project type choices formatted for inquirer (CLI)
 */
export function getInquirerProjectTypeChoices() {
  return PROJECT_TYPE_CHOICES.map((choice) => ({
    name: choice.label,
    value: choice.value,
    short: choice.shortLabel || choice.value,
  }));
}

/**
 * Get project type choices formatted for ink-select-input (UI)
 */
export function getUIProjectTypeChoices() {
  return PROJECT_TYPE_CHOICES.map((choice) => ({
    label: `${choice.icon || ''} ${choice.label}`,
    value: choice.value,
  }));
}

/**
 * Get generator choices formatted for ink-select-input (UI)
 */
export function getUIGeneratorChoices() {
  return [
    ...GENERATOR_CHOICES.map((choice) => ({
      label: `${choice.icon || ''} ${choice.label}`,
      value: choice.value,
    })),
    {label: '🔙 Back to main menu', value: 'back'},
  ];
}

/**
 * Get the recommended project type
 */
export function getRecommendedProjectType(): 'empty' | 'with-samples' {
  return (
    PROJECT_TYPE_CHOICES.find((choice) => choice.recommended)?.value ||
    'with-samples'
  );
}

/**
 * Get project type by value
 */
export function getProjectTypeChoice(
  value: 'empty' | 'with-samples'
): ProjectTypeChoice | undefined {
  return PROJECT_TYPE_CHOICES.find((choice) => choice.value === value);
}
