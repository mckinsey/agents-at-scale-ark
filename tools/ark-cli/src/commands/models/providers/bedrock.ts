import inquirer from 'inquirer';
import {CreateModelOptions} from '../create.js';
import {BedrockConfig, ProviderConfigCollector} from './types.js';

// Bedrock configuration collector
export class BedrockConfigCollector implements ProviderConfigCollector {
  async collectConfig(options: CreateModelOptions): Promise<BedrockConfig> {
    let region = options.region;
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

    let accessKeyId = options.accessKeyId;
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

    let secretAccessKey = options.secretAccessKey;
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

    let sessionToken = options.sessionToken;
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

    let modelArn = options.modelArn;
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
