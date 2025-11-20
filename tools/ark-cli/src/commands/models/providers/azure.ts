import inquirer from 'inquirer';
import {
  BaseProviderConfig,
  BaseCollectorOptions,
  ProviderConfigCollector,
} from './types.js';

/**
 * Configuration for Azure OpenAI models.
 */
export interface AzureConfig extends BaseProviderConfig {
  type: 'azure';
  baseUrl: string;
  apiKey: string;
  apiVersion: string;
}

/**
 * Options specific to Azure collector.
 */
export interface AzureCollectorOptions extends BaseCollectorOptions {
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
}

/**
 * Configuration collector for Azure OpenAI models.
 *
 * Collects the necessary configuration to connect to Azure OpenAI Service:
 * - baseUrl: The Azure OpenAI endpoint URL (e.g., https://<resource>.openai.azure.com)
 * - apiVersion: The API version to use (defaults to 2024-12-01-preview)
 * - apiKey: The authentication key for the Azure OpenAI resource
 *
 * Values can be provided via command-line options or will be prompted interactively.
 */
export class AzureConfigCollector implements ProviderConfigCollector {
  async collectConfig(options: BaseCollectorOptions): Promise<AzureConfig> {
    const azureOptions = options as AzureCollectorOptions;

    let baseUrl = azureOptions.baseUrl;
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

    let apiVersion = azureOptions.apiVersion || '';
    if (!azureOptions.apiVersion) {
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

    let apiKey = azureOptions.apiKey;
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
