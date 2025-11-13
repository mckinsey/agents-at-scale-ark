import {execa} from 'execa';
import inquirer from 'inquirer';
import output from '../../lib/output.js';
import {
  BaseCollectorOptions,
  ProviderConfigCollectorFactory,
} from './providers/index.js';
import {KubernetesSecretManager} from './kubernetes/secret-manager.js';
import {KubernetesModelManifestBuilder} from './kubernetes/manifest-builder.js';

/**
 * Common options for model creation.
 */
export interface CreateModelOptions extends BaseCollectorOptions {
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
          {name: 'AWS Bedrock', value: 'bedrock'},
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

  // Step 4: Collect provider-specific configuration
  const collector = ProviderConfigCollectorFactory.create(modelType!);
  const config = await collector.collectConfig({...options, model});
  config.secretName = `${modelName!}-model-secret`;

  // Step 5: Create the Kubernetes secret
  try {
    const secretManager = new KubernetesSecretManager();
    await secretManager.createSecret(config);
  } catch (error) {
    output.error('failed to create secret');
    console.error(error);
    return false;
  }

  // Step 6: Create the Model resource
  output.info(`creating model ${modelName}...`);

  const manifestBuilder = new KubernetesModelManifestBuilder(modelName!);
  const modelManifest = manifestBuilder.build(config);

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
