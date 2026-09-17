import { describe, expect, it } from 'vitest';

import type { Model } from '@/lib/services';

import {
  buildBaseUrlMode,
  createConfig,
  getBaseUrlState,
  getDefaultValuesForUpdate,
  getResetValues,
  mapBaseUrlState,
} from './utils';
import type { FormValues } from './schema';

const baseBedrockForm: FormValues = {
  name: 'test-bedrock',
  provider: 'bedrock',
  model: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  bedrockAuthMethod: 'iam',
  bedrockApiKeySecretName: '',
  bedrockAccessKeyIdSecretName: 'aws-access-key-id',
  bedrockSecretAccessKeySecretName: 'aws-secret-access-key',
  baseUrl: '',
  region: 'us-west-2',
  modelARN: '',
};

describe('createConfig (bedrock)', () => {
  it('uses the token key for each IAM credential secret', () => {
    const config = createConfig(baseBedrockForm);

    expect(config.bedrock?.accessKeyId).toEqual({
      valueFrom: {
        secretKeyRef: { name: 'aws-access-key-id', key: 'token' },
      },
    });
    expect(config.bedrock?.secretAccessKey).toEqual({
      valueFrom: {
        secretKeyRef: { name: 'aws-secret-access-key', key: 'token' },
      },
    });
  });

  it('emits only apiKey (with the token key) when auth method is apiKey', () => {
    const config = createConfig({
      ...baseBedrockForm,
      bedrockAuthMethod: 'apiKey',
      bedrockApiKeySecretName: 'bedrock-credentials',
    });

    expect(config.bedrock?.apiKey).toEqual({
      valueFrom: {
        secretKeyRef: { name: 'bedrock-credentials', key: 'token' },
      },
    });
    expect(config.bedrock?.accessKeyId).toBeUndefined();
    expect(config.bedrock?.secretAccessKey).toBeUndefined();
  });

  it('includes baseUrl as a configMapKeyRef when a configuration is selected (e.g. a gateway endpoint)', () => {
    const config = createConfig({
      ...baseBedrockForm,
      bedrockAuthMethod: 'apiKey',
      bedrockApiKeySecretName: 'ai-gateway',
      baseUrl: 'bedrock-gateway-url',
    });

    expect(config.bedrock?.baseUrl).toEqual({
      valueFrom: {
        configMapKeyRef: { name: 'bedrock-gateway-url', key: 'value' },
      },
    });
  });

  it('omits baseUrl when blank', () => {
    const config = createConfig(baseBedrockForm);

    expect(config.bedrock?.baseUrl).toBeUndefined();
  });
});

describe('getResetValues (bedrock)', () => {
  it('clears the credential secret names', () => {
    const reset = getResetValues(baseBedrockForm);

    expect(reset).toMatchObject({
      bedrockAuthMethod: 'iam',
      bedrockApiKeySecretName: '',
      bedrockAccessKeyIdSecretName: '',
      bedrockSecretAccessKeySecretName: '',
    });
  });
});

describe('getDefaultValuesForUpdate (bedrock)', () => {
  it('reads the existing secret keys from the model config', () => {
    const model = {
      name: 'test-bedrock',
      provider: 'bedrock',
      model: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
      config: {
        bedrock: {
          accessKeyId: {
            valueFrom: {
              secretKeyRef: { name: 'aws-credentials', key: 'access-key-id' },
            },
          },
          secretAccessKey: {
            valueFrom: {
              secretKeyRef: { name: 'aws-credentials', key: 'secret-access-key' },
            },
          },
        },
      },
    } as unknown as Model;

    const values = getDefaultValuesForUpdate(model);

    expect(values).toMatchObject({
      bedrockAuthMethod: 'iam',
      bedrockAccessKeyIdSecretName: 'aws-credentials',
      bedrockSecretAccessKeySecretName: 'aws-credentials',
    });
  });

  it('detects apiKey auth method and reads the api key secret', () => {
    const model = {
      name: 'test-bedrock',
      provider: 'bedrock',
      model: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
      config: {
        bedrock: {
          apiKey: {
            valueFrom: {
              secretKeyRef: {
                name: 'bedrock-credentials',
                key: 'bedrock-api-key',
              },
            },
          },
        },
      },
    } as unknown as Model;

    const values = getDefaultValuesForUpdate(model);

    expect(values).toMatchObject({
      bedrockAuthMethod: 'apiKey',
      bedrockApiKeySecretName: 'bedrock-credentials',
    });
  });
});

describe('mapBaseUrlState', () => {
  it('recognizes a configuration reference', () => {
    expect(
      mapBaseUrlState({
        valueFrom: { configMapKeyRef: { name: 'openai-url', key: 'value' } },
      }),
    ).toEqual({
      kind: 'configuration',
      configurationName: 'openai-url',
      configurationKey: 'value',
    });
  });

  it('recognizes a legacy literal value', () => {
    expect(mapBaseUrlState({ value: 'https://api.openai.com/v1' })).toEqual({
      kind: 'literal',
      url: 'https://api.openai.com/v1',
    });
  });

  it('recognizes an unset optional field', () => {
    expect(mapBaseUrlState(undefined)).toEqual({ kind: 'unset' });
  });
});

describe('createConfig / getDefaultValuesForUpdate (baseUrl as configuration)', () => {
  const openaiForm: FormValues = {
    name: 'test-openai',
    provider: 'openai',
    model: 'gpt-4-turbo',
    secret: 'openai-key',
    baseUrl: 'openai-url',
  };

  it('sends a configMapKeyRef with key "value" for a brand-new selection', () => {
    const config = createConfig(openaiForm);

    expect(config.openai?.baseUrl).toEqual({
      valueFrom: { configMapKeyRef: { name: 'openai-url', key: 'value' } },
    });
  });

  it('preserves the existing configMap key when the same configuration is kept', () => {
    const mode = buildBaseUrlMode({
      kind: 'configuration',
      configurationName: 'openai-url',
      configurationKey: 'custom-key',
    });

    const config = createConfig(openaiForm, mode);

    expect(config.openai?.baseUrl).toEqual({
      valueFrom: { configMapKeyRef: { name: 'openai-url', key: 'custom-key' } },
    });
  });

  it('falls back to key "value" when the user switches to a different configuration', () => {
    const mode = buildBaseUrlMode({
      kind: 'configuration',
      configurationName: 'old-openai-url',
      configurationKey: 'custom-key',
    });

    const config = createConfig(
      { ...openaiForm, baseUrl: 'new-openai-url' },
      mode,
    );

    expect(config.openai?.baseUrl).toEqual({
      valueFrom: { configMapKeyRef: { name: 'new-openai-url', key: 'value' } },
    });
  });

  it('reads back a legacy literal model into a literal state, not a configuration name', () => {
    const model = {
      name: 'test-openai',
      provider: 'openai',
      model: 'gpt-4-turbo',
      config: {
        openai: {
          apiKey: {
            valueFrom: { secretKeyRef: { name: 'openai-key', key: 'token' } },
          },
          baseUrl: { value: 'https://api.openai.com/v1' },
        },
      },
    } as unknown as Model;

    expect(getBaseUrlState(model, 'openai')).toEqual({
      kind: 'literal',
      url: 'https://api.openai.com/v1',
    });
    expect(getDefaultValuesForUpdate(model)).toMatchObject({ baseUrl: '' });
  });

  it('reads back a configured model into the configuration name', () => {
    const model = {
      name: 'test-openai',
      provider: 'openai',
      model: 'gpt-4-turbo',
      config: {
        openai: {
          apiKey: {
            valueFrom: { secretKeyRef: { name: 'openai-key', key: 'token' } },
          },
          baseUrl: {
            valueFrom: { configMapKeyRef: { name: 'openai-url', key: 'value' } },
          },
        },
      },
    } as unknown as Model;

    expect(getDefaultValuesForUpdate(model)).toMatchObject({
      baseUrl: 'openai-url',
    });
  });
});

describe('createConfig (bedrock optional baseUrl)', () => {
  it('omits baseUrl entirely when no configuration is selected', () => {
    const config = createConfig(baseBedrockForm);

    expect(config.bedrock?.baseUrl).toBeUndefined();
  });
});
