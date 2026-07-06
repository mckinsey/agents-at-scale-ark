import { describe, expect, it } from 'vitest';

import type { Model } from '@/lib/services';

import { createConfig, getDefaultValuesForUpdate, getResetValues } from './utils';
import type { FormValues } from './schema';

const baseBedrockForm: FormValues = {
  name: 'test-bedrock',
  provider: 'bedrock',
  model: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  bedrockAccessKeyIdSecretName: 'aws-credentials',
  bedrockAccessKeyIdSecretKey: 'access-key-id',
  bedrockSecretAccessKeySecretName: 'aws-credentials',
  bedrockSecretAccessKeySecretKey: 'secret-access-key',
  region: 'us-west-2',
  modelARN: '',
};

describe('createConfig (bedrock)', () => {
  it('uses the secret keys provided in the form', () => {
    const config = createConfig(baseBedrockForm);

    expect(config.bedrock?.accessKeyId).toEqual({
      valueFrom: {
        secretKeyRef: { name: 'aws-credentials', key: 'access-key-id' },
      },
    });
    expect(config.bedrock?.secretAccessKey).toEqual({
      valueFrom: {
        secretKeyRef: { name: 'aws-credentials', key: 'secret-access-key' },
      },
    });
  });

  it('passes through token keys when the form keeps the default', () => {
    const config = createConfig({
      ...baseBedrockForm,
      bedrockAccessKeyIdSecretKey: 'token',
      bedrockSecretAccessKeySecretKey: 'token',
    });

    expect(config.bedrock?.accessKeyId).toEqual({
      valueFrom: { secretKeyRef: { name: 'aws-credentials', key: 'token' } },
    });
    expect(config.bedrock?.secretAccessKey).toEqual({
      valueFrom: { secretKeyRef: { name: 'aws-credentials', key: 'token' } },
    });
  });
});

describe('getResetValues (bedrock)', () => {
  it('defaults the secret keys to token', () => {
    const reset = getResetValues(baseBedrockForm);

    expect(reset).toMatchObject({
      bedrockAccessKeyIdSecretKey: 'token',
      bedrockSecretAccessKeySecretKey: 'token',
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
      bedrockAccessKeyIdSecretName: 'aws-credentials',
      bedrockAccessKeyIdSecretKey: 'access-key-id',
      bedrockSecretAccessKeySecretName: 'aws-credentials',
      bedrockSecretAccessKeySecretKey: 'secret-access-key',
    });
  });

  it('falls back to token when the key is absent', () => {
    const model = {
      name: 'test-bedrock',
      provider: 'bedrock',
      model: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
      config: {
        bedrock: {
          accessKeyId: {
            valueFrom: { secretKeyRef: { name: 'aws-credentials' } },
          },
        },
      },
    } as unknown as Model;

    const values = getDefaultValuesForUpdate(model);

    expect(values).toMatchObject({
      bedrockAccessKeyIdSecretKey: 'token',
      bedrockSecretAccessKeySecretKey: 'token',
    });
  });
});
