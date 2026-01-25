import inquirer from 'inquirer';
import {
  BaseProviderConfig,
  BaseCollectorOptions,
  ProviderConfigCollector,
} from './types.js';

/**
 * Authentication mode for AWS Bedrock.
 */
export type BedrockAuthMode = 'apiKey' | 'accessKey';

/**
 * Configuration for AWS Bedrock models.
 */
export interface BedrockConfig extends BaseProviderConfig {
  type: 'bedrock';
  authMode: BedrockAuthMode;
  region: string;
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  modelArn?: string;
}

/**
 * Options specific to Bedrock collector.
 */
export interface BedrockCollectorOptions extends BaseCollectorOptions {
  authMode?: BedrockAuthMode;
  region?: string;
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  modelArn?: string;
}

/**
 * Configuration collector for AWS Bedrock models.
 *
 * Collects the necessary configuration to connect to AWS Bedrock:
 * - authMode: Authentication mode (apiKey or accessKey)
 * - region: The AWS region where Bedrock is deployed (e.g., us-east-1)
 * - apiKey: (Optional) Amazon Bedrock API key for bearer token auth
 * - accessKeyId: AWS access key ID for authentication (if using accessKey mode)
 * - secretAccessKey: AWS secret access key for authentication (if using accessKey mode)
 * - sessionToken: (Optional) AWS session token for temporary credentials
 * - modelArn: (Optional) Specific ARN for the model to use
 *
 * Values can be provided via command-line options or will be prompted interactively.
 */
export class BedrockConfigCollector implements ProviderConfigCollector {
  async collectConfig(options: BaseCollectorOptions): Promise<BedrockConfig> {
    const bedrockOptions = options as BedrockCollectorOptions;

    // Determine authentication mode
    let authMode = bedrockOptions.authMode;
    if (!authMode) {
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'authMode',
          message: 'Authentication mode:',
          choices: [
            { name: 'API Key (Bearer Token) - Recommended', value: 'apiKey' },
            { name: 'Access Key / Secret Access Key', value: 'accessKey' },
          ],
          default: 'apiKey',
        },
      ]);
      authMode = answer.authMode;
    }

    let region = bedrockOptions.region;
    if (!region) {
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'region',
          message: 'AWS region:',
          default: 'us-east-1',
        },
      ]);
      region = answer.region;
    }

    if (!region) {
      throw new Error('region is required');
    }

    let apiKey: string | undefined;
    let accessKeyId: string | undefined;
    let secretAccessKey: string | undefined;
    let sessionToken: string | undefined;

    if (authMode === 'apiKey') {
      // Collect API key
      apiKey = bedrockOptions.apiKey;
      if (!apiKey) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'Amazon Bedrock API key:',
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
    } else {
      // Collect access key credentials
      accessKeyId = bedrockOptions.accessKeyId;
      if (!accessKeyId) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'accessKeyId',
            message: 'AWS access key ID:',
            validate: (input) => {
              if (!input) return 'access key ID is required';
              return true;
            },
          },
        ]);
        accessKeyId = answer.accessKeyId;
      }

      if (!accessKeyId) {
        throw new Error('access key ID is required');
      }

      secretAccessKey = bedrockOptions.secretAccessKey;
      if (!secretAccessKey) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'secretAccessKey',
            message: 'AWS secret access key:',
            mask: '*',
            validate: (input) => {
              if (!input) return 'secret access key is required';
              return true;
            },
          },
        ]);
        secretAccessKey = answer.secretAccessKey;
      }

      if (!secretAccessKey) {
        throw new Error('secret access key is required');
      }

      sessionToken = bedrockOptions.sessionToken;
      if (!sessionToken) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'sessionToken',
            message: 'AWS session token (optional, press enter to skip):',
            mask: '*',
          },
        ]);
        sessionToken = answer.sessionToken;
      }
    }

    let modelArn = bedrockOptions.modelArn;
    if (!modelArn) {
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'modelArn',
          message: 'Model ARN (optional, press enter to skip):',
        },
      ]);
      modelArn = answer.modelArn;
    }

    return {
      type: 'bedrock',
      modelValue: options.model!,
      secretName: '',
      authMode: authMode!,
      region,
      apiKey: apiKey || undefined,
      accessKeyId: accessKeyId || undefined,
      secretAccessKey: secretAccessKey || undefined,
      sessionToken: sessionToken || undefined,
      modelArn: modelArn || undefined,
    };
  }
}
