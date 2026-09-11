import type {
  Model,
  ModelCreateRequest,
  ModelUpdateRequest,
} from '@/lib/services';

import type { FormValues } from './schema';

export const BASE_URL_CONFIGURATION_KEY = 'value';

export type BaseUrlFieldState =
  | {
      kind: 'configuration';
      configurationName: string;
      configurationKey: string;
    }
  | { kind: 'literal'; url: string }
  | { kind: 'unset' };

export type BaseUrlMode = {
  originalName?: string;
  originalKey?: string;
  literalUrl?: string;
};

type BaseUrlValueSource = {
  value?: string;
  valueFrom?: { configMapKeyRef?: { name: string; key: string } };
};

export function mapBaseUrlState(rawBaseUrl: unknown): BaseUrlFieldState {
  const source =
    rawBaseUrl && typeof rawBaseUrl === 'object'
      ? (rawBaseUrl as BaseUrlValueSource)
      : undefined;
  const configMapKeyRef = source?.valueFrom?.configMapKeyRef;
  if (configMapKeyRef?.name) {
    return {
      kind: 'configuration',
      configurationName: configMapKeyRef.name,
      configurationKey: configMapKeyRef.key || BASE_URL_CONFIGURATION_KEY,
    };
  }
  if (source?.value) {
    return { kind: 'literal', url: source.value };
  }
  return { kind: 'unset' };
}

export function buildBaseUrlMode(state: BaseUrlFieldState): BaseUrlMode {
  if (state.kind === 'configuration') {
    return {
      originalName: state.configurationName,
      originalKey: state.configurationKey,
    };
  }
  if (state.kind === 'literal') {
    return { literalUrl: state.url };
  }
  return {};
}

export function buildBaseUrlValueSource(
  configurationName: string | undefined | null,
  mode: BaseUrlMode = {},
): BaseUrlValueSource | undefined {
  if (!configurationName) {
    return mode.literalUrl ? { value: mode.literalUrl } : undefined;
  }
  const key =
    mode.originalKey && configurationName === mode.originalName
      ? mode.originalKey
      : BASE_URL_CONFIGURATION_KEY;
  return { valueFrom: { configMapKeyRef: { name: configurationName, key } } };
}

export function createConfig(
  formValues: FormValues,
  baseUrlMode: BaseUrlMode = {},
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
        // Non-null: the schema requires either a selected configuration or a
        // preserved baseUrlMode.literalUrl for this provider, so one of the
        // two branches in buildBaseUrlValueSource always returns a value.
        baseUrl: buildBaseUrlValueSource(formValues.baseUrl, baseUrlMode)!,
      };
      return config;
    case 'azure': {
      const azureConfig: Record<string, unknown> = {
        baseUrl: buildBaseUrlValueSource(formValues.baseUrl, baseUrlMode)!,
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
    case 'bedrock': {
      const bedrockBaseUrl = buildBaseUrlValueSource(
        formValues.baseUrl,
        baseUrlMode,
      );
      const bedrockConfig: Record<string, unknown> = {
        ...(bedrockBaseUrl && { baseUrl: bedrockBaseUrl }),
        ...(formValues.region && { region: formValues.region }),
        ...(formValues.modelARN && { modelArn: formValues.modelARN }),
      };
      if (formValues.bedrockAuthMethod === 'apiKey') {
        bedrockConfig.apiKey = {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockApiKeySecretName,
              key: 'token',
            },
          },
        };
      } else {
        bedrockConfig.accessKeyId = {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockAccessKeyIdSecretName,
              key: 'token',
            },
          },
        };
        bedrockConfig.secretAccessKey = {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockSecretAccessKeySecretName,
              key: 'token',
            },
          },
        };
      }
      (config as Record<string, unknown>).bedrock = bedrockConfig;
      return config;
    }
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
        baseUrl: buildBaseUrlValueSource(formValues.baseUrl, baseUrlMode)!,
        ...(formValues.anthropicVersion && {
          version: { value: formValues.anthropicVersion },
        }),
      };
      return config;
  }
}

export function createModelUpdateConfig(
  formValues: FormValues,
  baseUrlMode: BaseUrlMode = {},
): ModelUpdateRequest['config'] {
  return createConfig(formValues, baseUrlMode);
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
        bedrockAuthMethod: currentFormValues.bedrockAuthMethod ?? 'iam',
        bedrockApiKeySecretName: '',
        bedrockAccessKeyIdSecretName: '',
        bedrockSecretAccessKeySecretName: '',
        baseUrl: '',
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

export function getBaseUrlState(
  model: Model,
  provider: string,
): BaseUrlFieldState {
  return mapBaseUrlState(
    getConfigValue<unknown>(model.config, [provider, 'baseUrl']),
  );
}

function getBaseUrlConfigurationName(model: Model, provider: string): string {
  const state = getBaseUrlState(model, provider);
  return state.kind === 'configuration' ? state.configurationName : '';
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
        baseUrl: getBaseUrlConfigurationName(model, 'openai'),
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
        baseUrl: getBaseUrlConfigurationName(model, 'azure'),
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
    case 'bedrock': {
      const bedrockApiKeySecretName = getConfigValue<string>(model.config, [
        'bedrock',
        'apiKey',
        'valueFrom',
        'secretKeyRef',
        'name',
      ]);
      const bedrockAuthMethod: 'apiKey' | 'iam' = bedrockApiKeySecretName
        ? 'apiKey'
        : 'iam';
      return {
        name: model.name,
        provider: model.provider,
        model: model.model,
        bedrockAuthMethod,
        bedrockApiKeySecretName: bedrockApiKeySecretName || '',
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
        baseUrl: getBaseUrlConfigurationName(model, 'bedrock'),
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
        baseUrl: getBaseUrlConfigurationName(model, 'anthropic'),
        anthropicVersion:
          getConfigValue<string>(model.config, [
            'anthropic',
            'version',
            'value',
          ]) || '',
      };
  }
}
