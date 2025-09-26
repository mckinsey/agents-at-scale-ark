import {execa} from 'execa';
import inquirer from 'inquirer';
import output from '../../lib/output.js';

export async function createModel(modelName?: string): Promise<boolean> {
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
  } catch {
    // Model doesn't exist, continue
  }

  // Step 2: Choose model type
  const {modelType} = await inquirer.prompt([
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

  // Step 3: Get common parameters
  const commonAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'modelVersion',
      message: 'model version:',
      default: 'gpt-4o-mini',
    },
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

  // Remove trailing slash from base URL
  const baseUrl = commonAnswers.baseUrl.replace(/\/$/, '');

  // Step 4: Get provider-specific parameters
  let apiVersion = '';
  if (modelType === 'azure') {
    const azureAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiVersion',
        message: 'Azure API version:',
        default: '2024-12-01-preview',
      },
    ]);
    apiVersion = azureAnswers.apiVersion;
  }

  // Step 5: Get API key (password input)
  const {apiKey} = await inquirer.prompt([
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

  // Step 6: Create the Kubernetes secret
  const secretName = `${modelName}-model-api-key`;
  output.info(`creating secret ${secretName}...`);

  try {
    // Delete existing secret if it exists (update scenario)
    await execa('kubectl', ['delete', 'secret', secretName], {
      stdio: 'pipe',
    }).catch(() => {
      // Ignore error if secret doesn't exist
    });

    // Create the secret
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

    output.success(`secret ${secretName} created`);
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
        value: commonAnswers.modelVersion,
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

    output.success(`model ${modelName} created successfully`);
    console.log();
    output.info('you can now use this model with ARK agents and queries');
    return true;
  } catch (error) {
    output.error('failed to create model');
    console.error(error);

    // Try to clean up the secret if model creation failed
    try {
      await execa('kubectl', ['delete', 'secret', secretName], {stdio: 'pipe'});
      output.info(`cleaned up secret ${secretName}`);
    } catch {
      // Ignore cleanup errors
    }
    return false;
  }
}
