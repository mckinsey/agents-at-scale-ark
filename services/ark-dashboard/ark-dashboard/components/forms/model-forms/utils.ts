import type {
  Model,
  ModelCreateRequest,
  ModelUpdateRequest,
} from '@/lib/services';

import type { FormValues } from './schema';

export function createConfig(
  formValues: FormValues,
): ModelCreateRequest['config'] {
  const config: ModelCreateRequest['config'] = {};
  switch (formValues.provider) {
    case 'openai':
      config.openai = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: 'token',
            },
          },
        },
        baseUrl: formValues.baseUrl,
      };
      return config;
    case 'azure':
      config.azure = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: 'token',
            },
          },
        },
        baseUrl: formValues.baseUrl,
        ...(formValues.azureApiVersion && {
          apiVersion: formValues.azureApiVersion,
        }),
      };
      return config;
    case 'bedrock':
      config.bedrock = {
        accessKeyId: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockAccessKeyIdSecretName,
              key: 'token',
            },
          },
        },
        secretAccessKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockSecretAccessKeySecretName,
              key: 'token',
            },
          },
        },
        ...(formValues.region && { region: formValues.region }),
        ...(formValues.modelARN && { modelArn: formValues.modelARN }),
      };
      return config;
  }
}

export function createModelUpdateConfig(
  formValues: FormValues,
): ModelUpdateRequest['config'] {
  return createConfig(formValues);
}

export function getResetValues(currentFormValues: FormValues): FormValues {
  switch (currentFormValues.provider) {
    case 'openai':
      return {
        name: currentFormValues.name,
        provider: currentFormValues.provider,
        model: currentFormValues.model,
        secret: currentFormValues.secret ?? '',
        baseUrl: currentFormValues.baseUrl ?? '',
      };
    case 'azure':
      return {
        name: currentFormValues.name,
        provider: currentFormValues.provider,
        model: currentFormValues.model,
        secret: currentFormValues.secret ?? '',
        baseUrl: currentFormValues.baseUrl ?? '',
        azureApiVersion: '',
      };
    case 'bedrock':
      return {
        name: currentFormValues.name,
        provider: currentFormValues.provider,
        model: currentFormValues.model,
        bedrockAccessKeyIdSecretName: '',
        bedrockSecretAccessKeySecretName: '',
        region: '',
        modelARN: '',
      };
  }
}

function getConfigValue<T = unknown>(
  config: unknown,
  keys: string[],
): T | undefined {
  let current = config;

  for (const key of keys) {
    // Check if current is null, undefined, or not an object
    if (
      current === undefined ||
      current === null ||
      typeof current !== 'object'
    ) {
      return undefined;
    }

    // Get the value for the current key
    current = (current as Record<string, unknown>)[key];
  }

  return current as T;
}

export function getDefaultValuesForUpdate(model: Model): FormValues {
  switch (model.provider) {
    case 'openai':
      return {
        name: model.name,
        provider: model.provider,
        model: model.model,
        secret:
          getConfigValue<string>(model.config, [
            'openai',
            'apiKey',
            'valueFrom',
            'secretKeyRef',
            'name',
          ]) || '',
        baseUrl:
          getConfigValue<string>(model.config, [
            'openai',
            'baseUrl',
            'value',
          ]) || '',
      };
    case 'azure':
      return {
        name: model.name,
        provider: model.provider,
        model: model.model,
        secret:
          getConfigValue<string>(model.config, [
            'azure',
            'apiKey',
            'valueFrom',
            'secretKeyRef',
            'name',
          ]) || '',
        azureApiVersion:
          getConfigValue<string>(model.config, [
            'azure',
            'apiVersion',
            'value',
          ]) || '',
        baseUrl:
          getConfigValue<string>(model.config, ['azure', 'baseUrl', 'value']) ||
          '',
      };
    case 'bedrock':
      return {
        name: model.name,
        provider: model.provider,
        model: model.model,
        bedrockAccessKeyIdSecretName:
          getConfigValue<string>(model.config, [
            'bedrock',
            'accessKeyId',
            'valueFrom',
            'secretKeyRef',
            'name',
          ]) || '',
        bedrockSecretAccessKeySecretName:
          getConfigValue<string>(model.config, [
            'bedrock',
            'secretAccessKey',
            'valueFrom',
            'secretKeyRef',
            'name',
          ]) || '',
        region:
          getConfigValue<string>(model.config, [
            'bedrock',
            'region',
            'value',
          ]) || '',
        modelARN:
          getConfigValue<string>(model.config, [
            'bedrock',
            'modelArn',
            'value',
          ]) || '',
      };
  }
}
