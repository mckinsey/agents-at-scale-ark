import inquirer from 'inquirer';
import {
  BaseProviderConfig,
  BaseCollectorOptions,
  ProviderConfigCollector,
} from './types.js';

export interface AnthropicConfig extends BaseProviderConfig {
  type: 'anthropic';
  baseUrl: string;
  apiKey: string;
}

export interface AnthropicCollectorOptions extends BaseCollectorOptions {
  baseUrl?: string;
  apiKey?: string;
}

export class AnthropicConfigCollector implements ProviderConfigCollector {
  async collectConfig(options: BaseCollectorOptions): Promise<AnthropicConfig> {
    const anthropicOptions = options as AnthropicCollectorOptions;

    let baseUrl = anthropicOptions.baseUrl;
    if (!baseUrl) {
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: 'base URL:',
          default: 'https://api.anthropic.com/v1',
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

    let apiKey = anthropicOptions.apiKey;
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
      type: 'anthropic',
      modelValue: options.model!,
      secretName: '',
      baseUrl,
      apiKey,
    };
  }
}
