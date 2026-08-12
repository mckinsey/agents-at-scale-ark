import { describe, expect, it } from 'vitest';

import type { MCPHeader } from '@/lib/services/mcp-servers';
import {
  type AddressMode,
  buildHeader,
  buildSpec,
  type HeaderData,
  mapDetailAddress,
  mapDetailHeaders,
  validateHeaders,
} from '@/components/forms/mcp-forms/utils';

const row = (overrides: Partial<HeaderData>): HeaderData => ({
  key: 'row-1',
  name: '',
  type: 'direct',
  value: '',
  ...overrides,
});

const values = {
  name: 'github-mcp',
  description: 'GitHub remote MCP',
  configurationName: 'github-mcp-url',
  transport: 'http' as const,
};

describe('mapDetailAddress', () => {
  it('reads a configuration reference', () => {
    const state = mapDetailAddress(
      {
        valueFrom: { configMapKeyRef: { name: 'github-mcp-url', key: 'value' } },
      },
      'https://api.githubcopilot.com/mcp/',
    );
    expect(state).toEqual({
      kind: 'configuration',
      configurationName: 'github-mcp-url',
    });
  });

  it('reads a literal address', () => {
    const state = mapDetailAddress(
      { value: 'https://api.githubcopilot.com/mcp/' },
      'https://api.githubcopilot.com/mcp/',
    );
    expect(state).toEqual({
      kind: 'literal',
      url: 'https://api.githubcopilot.com/mcp/',
    });
  });

  it('reads a service reference and keeps the resolved address', () => {
    const serviceRef = {
      name: 'ark-mcp',
      port: 'http',
      path: '/mcp',
      namespace: 'ark',
    };
    const state = mapDetailAddress(
      { valueFrom: { serviceRef } },
      'http://ark-mcp.ark.svc.cluster.local:80/mcp',
    );
    expect(state).toEqual({
      kind: 'service',
      serviceRef,
      resolvedAddress: 'http://ark-mcp.ark.svc.cluster.local:80/mcp',
    });
  });

  it('falls back to the resolved address when the source is missing', () => {
    const state = mapDetailAddress(null, 'https://legacy.example/mcp');
    expect(state).toEqual({
      kind: 'literal',
      url: 'https://legacy.example/mcp',
    });
  });
});

describe('buildSpec', () => {
  it('writes a configMapKeyRef for the configuration mode', () => {
    const spec = buildSpec(values, [], { kind: 'configuration' });
    expect(spec.address).toEqual({
      valueFrom: {
        configMapKeyRef: { name: 'github-mcp-url', key: 'value' },
      },
    });
  });

  it('round-trips a serviceRef untouched', () => {
    const serviceRef = {
      name: 'ark-mcp',
      port: 'http',
      path: '/mcp',
      namespace: 'ark',
    };
    const mode: AddressMode = { kind: 'service', serviceRef };
    const spec = buildSpec({ ...values, configurationName: '' }, [], mode);
    expect(spec.address).toEqual({ valueFrom: { serviceRef } });
  });

  it('still maps headers', () => {
    const spec = buildSpec(
      values,
      [
        {
          key: 'row-1',
          name: 'Authorization',
          type: 'secret',
          value: 'github-pat',
        },
      ],
      { kind: 'configuration' },
    );
    expect(spec.headers).toEqual([
      {
        name: 'Authorization',
        value: { valueFrom: { secretKeyRef: { name: 'github-pat', key: 'token' } } },
      },
    ]);
  });
});

describe('validateHeaders', () => {
  it('ignores completely empty rows', () => {
    const result = validateHeaders([row({ key: 'a' }), row({ key: 'b' })]);
    expect(result.hasErrors).toBe(false);
    expect(result.errors).toEqual({});
    expect(result.nonEmptyHeaders).toHaveLength(0);
  });

  it('flags a row with a name but no value', () => {
    const result = validateHeaders([row({ key: 'a', name: 'Authorization' })]);
    expect(result.hasErrors).toBe(true);
    expect(result.errors.a.valueError).toBeDefined();
    expect(result.errors.a.nameError).toBeUndefined();
    expect(result.nonEmptyHeaders).toHaveLength(1);
  });

  it('flags a row with a value but no name', () => {
    const result = validateHeaders([row({ key: 'a', value: 'token' })]);
    expect(result.hasErrors).toBe(true);
    expect(result.errors.a.nameError).toBeDefined();
    expect(result.errors.a.valueError).toBeUndefined();
  });

  it('passes a fully populated row', () => {
    const result = validateHeaders([
      row({ key: 'a', name: 'Authorization', value: 'token' }),
    ]);
    expect(result.hasErrors).toBe(false);
    expect(result.errors).toEqual({});
    expect(result.nonEmptyHeaders).toHaveLength(1);
  });

  it('reports errors only for the incomplete rows', () => {
    const result = validateHeaders([
      row({ key: 'good', name: 'Authorization', value: 'token' }),
      row({ key: 'bad', name: 'X-Api-Key' }),
      row({ key: 'empty' }),
    ]);
    expect(result.hasErrors).toBe(true);
    expect(Object.keys(result.errors)).toEqual(['bad']);
    expect(result.nonEmptyHeaders.map(h => h.key)).toEqual(['good', 'bad']);
  });
});

describe('buildHeader', () => {
  it('builds a direct header', () => {
    expect(
      buildHeader(row({ name: 'Authorization', type: 'direct', value: 'abc' })),
    ).toEqual({
      name: 'Authorization',
      value: { value: 'abc' },
    });
  });

  it('builds a secret header referencing the token key', () => {
    expect(
      buildHeader(row({ name: 'Authorization', type: 'secret', value: 'my-secret' })),
    ).toEqual({
      name: 'Authorization',
      value: {
        valueFrom: { secretKeyRef: { name: 'my-secret', key: 'token' } },
      },
    });
  });
});

describe('mapDetailHeaders', () => {
  it('returns a single empty row when there are no headers', () => {
    expect(mapDetailHeaders(null)).toEqual([
      { key: 'row-1', name: '', type: 'direct', value: '' },
    ]);
    expect(mapDetailHeaders([])).toHaveLength(1);
  });

  it('maps a direct header to a direct row', () => {
    const headers = [
      { name: 'Authorization', value: { value: 'abc' } },
    ] as MCPHeader[];
    const result = mapDetailHeaders(headers);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Authorization',
      type: 'direct',
      value: 'abc',
    });
  });

  it('maps a secret header to a secret row using the secret name', () => {
    const headers = [
      {
        name: 'Authorization',
        value: {
          valueFrom: { secretKeyRef: { name: 'my-secret', key: 'token' } },
        },
      },
    ] as MCPHeader[];
    const result = mapDetailHeaders(headers);
    expect(result[0]).toMatchObject({
      name: 'Authorization',
      type: 'secret',
      value: 'my-secret',
    });
  });

  it('assigns a unique key to each mapped row', () => {
    const headers = [
      { name: 'A', value: { value: '1' } },
      { name: 'B', value: { value: '2' } },
    ] as MCPHeader[];
    const result = mapDetailHeaders(headers);
    expect(result[0].key).not.toBe(result[1].key);
  });
});
