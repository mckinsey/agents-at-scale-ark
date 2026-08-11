import { describe, expect, it } from 'vitest';

import type { Model } from '@/lib/services';

import { createConfig, getDefaultValuesForUpdate, getResetValues } from './utils';
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

  it('includes baseUrl when set (e.g. a gateway endpoint)', () => {
    const config = createConfig({
      ...baseBedrockForm,
      bedrockAuthMethod: 'apiKey',
      bedrockApiKeySecretName: 'ai-gateway',
      baseUrl: 'https://aws-bedrock.example.com/project-id',
    });

    expect(config.bedrock?.baseUrl).toBe(
      'https://aws-bedrock.example.com/project-id',
    );
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
