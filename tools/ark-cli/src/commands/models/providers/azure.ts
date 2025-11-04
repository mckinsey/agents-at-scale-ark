import inquirer from 'inquirer';
import {CreateModelOptions} from '../create.js';
import {AzureConfig, ProviderConfigCollector} from './types.js';

// Azure configuration collector
export class AzureConfigCollector implements ProviderConfigCollector {
  async collectConfig(options: CreateModelOptions): Promise<AzureConfig> {
    let baseUrl = options.baseUrl;
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

    let apiVersion = options.apiVersion || '';
    if (!options.apiVersion) {
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiVersion',
          message: 'Azure API version:',
          default: '2024-12-01-preview',
        },
      ]);
      apiVersion = answer.apiVersion;
    }

    let apiKey = options.apiKey;
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
      type: 'azure',
      modelValue: options.model!,
      secretName: '',
      baseUrl,
      apiKey,
      apiVersion,
    };
  }
}
