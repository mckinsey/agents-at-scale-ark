import inquirer from 'inquirer';
import {
  BaseProviderConfig,
  BaseCollectorOptions,
  ProviderConfigCollector,
} from './types.js';

export type AzureAuthMethod =
  | 'apiKey'
  | 'managedIdentity'
  | 'workloadIdentity';

/**
 * Configuration for Azure OpenAI models.
 */
export interface AzureConfig extends BaseProviderConfig {
  type: 'azure';
  baseUrl: string;
  apiVersion: string;
  authMethod?: AzureAuthMethod;
  apiKey?: string;
  clientId?: string;
  tenantId?: string;
}

/**
 * Options specific to Azure collector.
 */
export interface AzureCollectorOptions extends BaseCollectorOptions {
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
  authMethod?: AzureAuthMethod;
  clientId?: string;
  tenantId?: string;
}

/**
 * Configuration collector for Azure OpenAI models.
 *
 * Supports API Key, Managed Identity (AKS), and Workload Identity auth.
 * Values can be provided via command-line options or prompted interactively.
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

    let authMethod = azureOptions.authMethod;
    if (!authMethod && azureOptions.apiKey) {
      authMethod = 'apiKey';
    }
    if (!authMethod) {
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'authMethod',
          message: 'Authentication:',
          choices: [
            { name: 'API Key', value: 'apiKey' },
            { name: 'Managed Identity (AKS)', value: 'managedIdentity' },
            { name: 'Workload Identity', value: 'workloadIdentity' },
          ],
        },
      ]);
      authMethod = answer.authMethod;
    }

    let apiKey: string | undefined;
    let clientId: string | undefined;
    let tenantId: string | undefined;

    if (authMethod === 'apiKey') {
      apiKey = azureOptions.apiKey;
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
    } else if (authMethod === 'managedIdentity') {
      clientId = azureOptions.clientId;
      if (!clientId) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'clientId',
            message: 'Managed Identity Client ID (optional for system-assigned):',
          },
        ]);
        clientId = answer.clientId || undefined;
      }
    } else if (authMethod === 'workloadIdentity') {
      clientId = azureOptions.clientId;
      tenantId = azureOptions.tenantId;
      if (!clientId) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'clientId',
            message: 'Workload Identity Client ID:',
            validate: (input) =>
              input ? true : 'Client ID is required for Workload Identity',
          },
        ]);
        clientId = answer.clientId;
      }
      if (!tenantId) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'tenantId',
            message: 'Azure Tenant ID:',
            validate: (input) =>
              input ? true : 'Tenant ID is required for Workload Identity',
          },
        ]);
        tenantId = answer.tenantId;
      }
    }

    return {
      type: 'azure',
      modelValue: options.model!,
      secretName: '',
      baseUrl,
      apiVersion,
      authMethod,
      apiKey,
      clientId,
      tenantId,
    };
  }
}
