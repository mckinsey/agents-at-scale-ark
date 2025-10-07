import {execa} from 'execa';
import inquirer from 'inquirer';
import output from '../../lib/output.js';

export interface CreateModelOptions {
  type?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
  yes?: boolean;
}

export async function createModel(
  modelName?: string,
  options: CreateModelOptions = {}
): Promise<boolean> {
  // Step 1: Get model name if not provided
  if (!modelName) {
    const nameAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'modelName',
        message: 'model name:',
        default: 'default',
        validate: (input) => {
          if (!input) return 'model name is required';
          // Kubernetes name validation
          if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(input)) {
            return 'model name must be a valid Kubernetes resource name';
          }
          return true;
        },
      },
    ]);
    modelName = nameAnswer.modelName;
  }

  // Check if model already exists
  try {
    await execa('kubectl', ['get', 'model', modelName!], {stdio: 'pipe'});
    output.warning(`model ${modelName} already exists`);

    if (!options.yes) {
      const {overwrite} = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `overwrite existing model ${modelName}?`,
          default: false,
        },
      ]);

      if (!overwrite) {
        output.info('model creation cancelled');
        return false;
      }
    }
  } catch {
    // Model doesn't exist, continue
  }

  // Step 2: Get model type
  let modelType = options.type;
  if (!modelType) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'modelType',
        message: 'select model provider:',
        choices: [
          {name: 'Azure OpenAI', value: 'azure'},
          {name: 'OpenAI', value: 'openai'},
        ],
        default: 'azure',
      },
    ]);
    modelType = answer.modelType;
  }

  // Step 3: Get model name
  let model = options.model;
  if (!model) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'model',
        message: 'model:',
        default: 'gpt-4o-mini',
      },
    ]);
    model = answer.model;
  }

  // Step 4: Get base URL
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

  // Validate and clean base URL
  if (!baseUrl) {
    output.error('base URL is required');
    return false;
  }
  baseUrl = baseUrl.replace(/\/$/, '');

  // Step 5: Get API version (Azure only)
  let apiVersion = options.apiVersion || '';
  if (modelType === 'azure' && !options.apiVersion) {
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

  // Step 6: Get API key
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

  // Step 6: Create the Kubernetes secret
  const secretName = `${modelName}-model-api-key`;

  try {
    await execa(
      'kubectl',
      [
        'create',
        'secret',
        'generic',
        secretName,
        `--from-literal=api-key=${apiKey}`,
      ],
      {stdio: 'pipe'}
    );

    output.success(`created secret ${secretName}`);
  } catch (error) {
    output.error('failed to create secret');
    console.error(error);
    return false;
  }

  // Step 7: Create the Model resource
  output.info(`creating model ${modelName}...`);

  const modelManifest = {
    apiVersion: 'ark.mckinsey.com/v1alpha1',
    kind: 'Model',
    metadata: {
      name: modelName,
    },
    spec: {
      type: modelType,
      model: {
        value: model,
      },
      config: {} as Record<string, unknown>,
    },
  };

  // Add provider-specific config
  if (modelType === 'azure') {
    modelManifest.spec.config.azure = {
      apiKey: {
        valueFrom: {
          secretKeyRef: {
            name: secretName,
            key: 'api-key',
          },
        },
      },
      baseUrl: {
        value: baseUrl,
      },
      apiVersion: {
        value: apiVersion,
      },
    };
  } else {
    modelManifest.spec.config.openai = {
      apiKey: {
        valueFrom: {
          secretKeyRef: {
            name: secretName,
            key: 'api-key',
          },
        },
      },
      baseUrl: {
        value: baseUrl,
      },
    };
  }

  try {
    // Apply the model manifest using kubectl
    const manifestJson = JSON.stringify(modelManifest);
    await execa('kubectl', ['apply', '-f', '-'], {
      input: manifestJson,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    output.success(`model ${modelName} created`);
    return true;
  } catch (error) {
    output.error('failed to create model');
    console.error(error);
    return false;
  }
}
