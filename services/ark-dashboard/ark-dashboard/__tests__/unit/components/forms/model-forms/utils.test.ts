import { describe, expect, it } from 'vitest';

import {
  buildBaseUrlMode,
  buildBaseUrlValueSource,
  createConfig,
  mapBaseUrlState,
} from '@/components/forms/model-forms/utils';
import { createSchema } from '@/components/forms/model-forms/schema';
import type { FormValues } from '@/components/forms/model-forms/schema';

describe('mapBaseUrlState', () => {
  it('reads a configuration reference', () => {
    expect(
      mapBaseUrlState({
        valueFrom: { configMapKeyRef: { name: 'ai-gateway', key: 'value' } },
      }),
    ).toEqual({
      kind: 'configuration',
      configurationName: 'ai-gateway',
      configurationKey: 'value',
    });
  });

  it('reads a legacy literal value', () => {
    expect(mapBaseUrlState({ value: 'https://api.openai.com/v1' })).toEqual({
      kind: 'literal',
      url: 'https://api.openai.com/v1',
    });
  });

  it('reports unset when there is no source', () => {
    expect(mapBaseUrlState(undefined)).toEqual({ kind: 'unset' });
  });
});

describe('buildBaseUrlMode', () => {
  it('carries the original configuration name and key', () => {
    expect(
      buildBaseUrlMode({
        kind: 'configuration',
        configurationName: 'ai-gateway',
        configurationKey: 'url',
      }),
    ).toEqual({ originalName: 'ai-gateway', originalKey: 'url' });
  });

  it('carries the literal url forward as a fallback, not an original', () => {
    expect(
      buildBaseUrlMode({ kind: 'literal', url: 'https://legacy.example/v1' }),
    ).toEqual({ literalUrl: 'https://legacy.example/v1' });
  });

  it('has no fallback for an unset base url', () => {
    expect(buildBaseUrlMode({ kind: 'unset' })).toEqual({});
  });
});

describe('buildBaseUrlValueSource', () => {
  it('writes a configMapKeyRef when a configuration is selected', () => {
    expect(buildBaseUrlValueSource('ai-gateway')).toEqual({
      valueFrom: { configMapKeyRef: { name: 'ai-gateway', key: 'value' } },
    });
  });

  it('preserves the original key when the configuration is unchanged', () => {
    expect(
      buildBaseUrlValueSource('ai-gateway', {
        originalName: 'ai-gateway',
        originalKey: 'url',
      }),
    ).toEqual({
      valueFrom: { configMapKeyRef: { name: 'ai-gateway', key: 'url' } },
    });
  });

  it('falls back to the value key when the configuration changes', () => {
    expect(
      buildBaseUrlValueSource('other-gateway', {
        originalName: 'ai-gateway',
        originalKey: 'url',
      }),
    ).toEqual({
      valueFrom: { configMapKeyRef: { name: 'other-gateway', key: 'value' } },
    });
  });

  it('preserves a legacy literal url when no configuration is selected', () => {
    expect(
      buildBaseUrlValueSource(undefined, {
        literalUrl: 'https://legacy.example/v1',
      }),
    ).toEqual({ value: 'https://legacy.example/v1' });
  });

  it('returns undefined when there is neither a configuration nor a literal fallback', () => {
    expect(buildBaseUrlValueSource(undefined)).toBeUndefined();
    expect(buildBaseUrlValueSource('')).toBeUndefined();
  });
});

describe('createSchema - editing a model with a legacy literal base URL', () => {
  const openaiValues = {
    name: 'my-model',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    secret: 'openai-token',
  };

  it('requires a configuration when there is no literal fallback', () => {
    const schema = createSchema(false);
    const result = schema.safeParse({ ...openaiValues, baseUrl: '' });
    expect(result.success).toBe(false);
  });

  it('does not require a configuration when a literal fallback exists', () => {
    const schema = createSchema(true);
    const result = schema.safeParse({ ...openaiValues, baseUrl: '' });
    expect(result.success).toBe(true);
  });

  it('leaves bedrock base URL optional either way', () => {
    const bedrockValues = {
      name: 'my-model',
      provider: 'bedrock' as const,
      model: 'anthropic.claude-v2',
      bedrockAuthMethod: 'iam' as const,
      bedrockApiKeySecretName: '',
      bedrockAccessKeyIdSecretName: 'access-key',
      bedrockSecretAccessKeySecretName: 'secret-key',
      baseUrl: '',
      region: '',
      modelARN: '',
    };
    expect(createSchema(false).safeParse(bedrockValues).success).toBe(true);
    expect(createSchema(true).safeParse(bedrockValues).success).toBe(true);
  });
});

describe('createConfig - preserving a legacy literal base URL on submit', () => {
  it('keeps the original literal value when the field is left untouched', () => {
    const formValues = {
      name: 'my-model',
      provider: 'openai',
      model: 'gpt-4o-mini',
      secret: 'openai-token',
      baseUrl: '',
    } as FormValues;

    const config = createConfig(formValues, {
      literalUrl: 'https://legacy.example/v1',
    });

    expect(config.openai?.baseUrl).toEqual({
      value: 'https://legacy.example/v1',
    });
  });

  it('migrates to a configuration once one is selected', () => {
    const formValues = {
      name: 'my-model',
      provider: 'openai',
      model: 'gpt-4o-mini',
      secret: 'openai-token',
      baseUrl: 'ai-gateway',
    } as FormValues;

    const config = createConfig(formValues, {
      literalUrl: 'https://legacy.example/v1',
    });

    expect(config.openai?.baseUrl).toEqual({
      valueFrom: { configMapKeyRef: { name: 'ai-gateway', key: 'value' } },
    });
  });
});
