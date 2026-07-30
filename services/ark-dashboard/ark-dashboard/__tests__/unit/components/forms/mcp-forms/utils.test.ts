import { describe, expect, it } from 'vitest';

import type { MCPHeader } from '@/lib/services/mcp-servers';
import {
  buildHeader,
  type HeaderData,
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
