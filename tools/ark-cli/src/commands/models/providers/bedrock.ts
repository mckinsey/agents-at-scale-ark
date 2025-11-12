import inquirer from 'inquirer';
import {
  BaseProviderConfig,
  BaseCollectorOptions,
  ProviderConfigCollector,
} from './types.js';

/**
 * Configuration for AWS Bedrock models.
 */
export interface BedrockConfig extends BaseProviderConfig {
  type: 'bedrock';
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  modelArn?: string;
}

/**
 * Options specific to Bedrock collector.
 */
export interface BedrockCollectorOptions extends BaseCollectorOptions {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  modelArn?: string;
}

/**
 * Configuration collector for AWS Bedrock models.
 *
 * Collects the necessary configuration to connect to AWS Bedrock:
 * - region: The AWS region where Bedrock is deployed (e.g., us-east-1)
 * - accessKeyId: AWS access key ID for authentication
 * - secretAccessKey: AWS secret access key for authentication
 * - sessionToken: (Optional) AWS session token for temporary credentials
 * - modelArn: (Optional) Specific ARN for the model to use
 *
 * Values can be provided via command-line options or will be prompted interactively.
 */
export class BedrockConfigCollector implements ProviderConfigCollector {
  async collectConfig(options: BaseCollectorOptions): Promise<BedrockConfig> {
    const bedrockOptions = options as BedrockCollectorOptions;

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

    let accessKeyId = bedrockOptions.accessKeyId;
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

    let secretAccessKey = bedrockOptions.secretAccessKey;
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

    let sessionToken = bedrockOptions.sessionToken;
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
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken: sessionToken || undefined,
      modelArn: modelArn || undefined,
    };
  }
}
