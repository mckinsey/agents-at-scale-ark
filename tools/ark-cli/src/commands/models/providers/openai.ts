import inquirer from 'inquirer';
import {
  BaseProviderConfig,
  BaseCollectorOptions,
  ProviderConfigCollector,
} from './types.js';

/**
 * Configuration for OpenAI models.
 */
export interface OpenAIConfig extends BaseProviderConfig {
  type: 'openai';
  baseUrl: string;
  apiKey: string;
}

/**
 * Options specific to OpenAI collector.
 */
export interface OpenAICollectorOptions extends BaseCollectorOptions {
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Configuration collector for OpenAI models.
 *
 * Collects the necessary configuration to connect to an OpenAI-compatible API:
 * - baseUrl: The API endpoint URL (e.g., https://api.openai.com/v1)
 * - apiKey: The authentication key for the API
 *
 * Values can be provided via command-line options or will be prompted interactively.
 */
export class OpenAIConfigCollector implements ProviderConfigCollector {
  async collectConfig(options: BaseCollectorOptions): Promise<OpenAIConfig> {
    const openaiOptions = options as OpenAICollectorOptions;

    let baseUrl = openaiOptions.baseUrl;
    if (!baseUrl) {
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: 'base URL:',
          validate: (input) => {
            if (!input) return 'base URL is required';
            try {
              new URL(input);
              return true;
            } catch {
              return 'please enter a valid URL';
            }
          },
        },
      ]);
      baseUrl = answer.baseUrl;
    }

    if (!baseUrl) {
      throw new Error('base URL is required');
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    let apiKey = openaiOptions.apiKey;
    if (!apiKey) {
      const answer = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'API key:',
          mask: '*',
          validate: (input) => {
            if (!input) return 'API key is required';
            return true;
          },
        },
      ]);
      apiKey = answer.apiKey;
    }

    if (!apiKey) {
      throw new Error('API key is required');
    }

    return {
      type: 'openai',
      modelValue: options.model!,
      secretName: '',
      baseUrl,
      apiKey,
    };
  }
}
