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
    case 'azure': {
      const azureConfig: Record<string, unknown> = {
        baseUrl: formValues.baseUrl,
        ...(formValues.azureApiVersion && {
          apiVersion: { value: formValues.azureApiVersion },
        }),
      };
      if (formValues.azureAuthMethod === 'apiKey') {
        azureConfig.auth = {
          apiKey: {
            valueFrom: {
              secretKeyRef: {
                name: formValues.secret,
                key: 'token',
              },
            },
          },
        };
      } else if (formValues.azureAuthMethod === 'managedIdentity') {
        azureConfig.auth = {
          managedIdentity: formValues.azureClientId
            ? { clientId: { value: formValues.azureClientId } }
            : {},
        };
      } else if (formValues.azureAuthMethod === 'workloadIdentity') {
        azureConfig.auth = {
          workloadIdentity: {
            clientId: { value: formValues.azureClientId },
            tenantId: { value: formValues.azureTenantId },
          },
        };
      }
      (config as Record<string, unknown>).azure = azureConfig;
      return config;
    }
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
    case 'anthropic':
      (config as Record<string, unknown>).anthropic = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: 'token',
            },
          },
        },
        baseUrl: formValues.baseUrl,
        ...(formValues.anthropicVersion && {
          version: { value: formValues.anthropicVersion },
        }),
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
        azureAuthMethod: currentFormValues.azureAuthMethod ?? 'apiKey',
        secret: currentFormValues.secret ?? '',
        baseUrl: currentFormValues.baseUrl ?? '',
        azureApiVersion: currentFormValues.azureApiVersion ?? '',
        azureClientId: currentFormValues.azureClientId ?? '',
        azureTenantId: currentFormValues.azureTenantId ?? '',
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
    case 'anthropic':
      return {
        name: currentFormValues.name,
        provider: currentFormValues.provider,
        model: currentFormValues.model,
        secret: '',
        baseUrl: '',
        anthropicVersion: '',
      };
  }
}

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function getConfigValue<T = unknown>(
  config: unknown,
  keys: string[],
): T | undefined {
  let current = config;

  for (const key of keys) {
    if (
      current === undefined ||
      current === null ||
      typeof current !== 'object'
    ) {
      return undefined;
    }
    const obj = current as Record<string, unknown>;
    current = obj[key];
    if (current === undefined) {
      current = obj[camelToSnake(key)];
    }
  }

  return current as T;
}

function getAuthSubKey(
  auth: Record<string, unknown> | undefined,
  camelKey: string,
): unknown {
  if (auth === undefined || auth === null) return undefined;
  return auth[camelKey] ?? auth[camelToSnake(camelKey)];
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
    case 'azure': {
      const auth = getConfigValue<Record<string, unknown>>(model.config, [
        'azure',
        'auth',
      ]);
      let azureAuthMethod: 'apiKey' | 'managedIdentity' | 'workloadIdentity' =
        'apiKey';
      let secret = '';
      let azureClientId = '';
      let azureTenantId = '';
      const hasManagedIdentity =
        getAuthSubKey(auth, 'managedIdentity') !== undefined &&
        getAuthSubKey(auth, 'managedIdentity') !== null;
      const hasWorkloadIdentity =
        getAuthSubKey(auth, 'workloadIdentity') !== undefined &&
        getAuthSubKey(auth, 'workloadIdentity') !== null;
      const hasAuthApiKey =
        getAuthSubKey(auth, 'apiKey') !== undefined &&
        getAuthSubKey(auth, 'apiKey') !== null;
      const topLevelApiKeyValue = getConfigValue<string>(model.config, [
        'azure',
        'apiKey',
        'value',
      ]);
      const isPlaceholderApiKey =
        topLevelApiKeyValue === '' || topLevelApiKeyValue === undefined;
      if (hasManagedIdentity) {
        azureAuthMethod = 'managedIdentity';
        azureClientId =
          getConfigValue<string>(model.config, [
            'azure',
            'auth',
            'managedIdentity',
            'clientId',
            'value',
          ]) || '';
      } else if (hasWorkloadIdentity) {
        azureAuthMethod = 'workloadIdentity';
        azureClientId =
          getConfigValue<string>(model.config, [
            'azure',
            'auth',
            'workloadIdentity',
            'clientId',
            'value',
          ]) || '';
        azureTenantId =
          getConfigValue<string>(model.config, [
            'azure',
            'auth',
            'workloadIdentity',
            'tenantId',
            'value',
          ]) || '';
      } else if (hasAuthApiKey) {
        azureAuthMethod = 'apiKey';
        secret =
          getConfigValue<string>(model.config, [
            'azure',
            'auth',
            'apiKey',
            'valueFrom',
            'secretKeyRef',
            'name',
          ]) || '';
      } else if (isPlaceholderApiKey) {
        azureAuthMethod = 'managedIdentity';
      } else {
        secret =
          getConfigValue<string>(model.config, [
            'azure',
            'apiKey',
            'valueFrom',
            'secretKeyRef',
            'name',
          ]) || '';
      }
      return {
        name: model.name,
        provider: model.provider,
        model: model.model,
        azureAuthMethod,
        secret,
        baseUrl:
          getConfigValue<string>(model.config, ['azure', 'baseUrl', 'value']) ||
          '',
        azureApiVersion:
          getConfigValue<string>(model.config, [
            'azure',
            'apiVersion',
            'value',
          ]) || '',
        azureClientId,
        azureTenantId,
      };
    }
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
    case 'anthropic':
      return {
        name: model.name,
        provider: model.provider as 'anthropic',
        model: model.model,
        secret:
          getConfigValue<string>(model.config, [
            'anthropic',
            'apiKey',
            'valueFrom',
            'secretKeyRef',
            'name',
          ]) || '',
        baseUrl:
          getConfigValue<string>(model.config, [
            'anthropic',
            'baseUrl',
            'value',
          ]) || '',
        anthropicVersion:
          getConfigValue<string>(model.config, [
            'anthropic',
            'version',
            'value',
          ]) || '',
      };
  }
}
