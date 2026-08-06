import { describe, expect, it } from 'vitest';

import {
  ALIAS_ANNOTATION,
  DESCRIPTION_ANNOTATION,
  normaliseLabels,
  readResourceMetadata,
  toResourceAnnotations,
  toResourceLabelMap,
} from '@/lib/utils/resource-metadata';

describe('readResourceMetadata', () => {
  it('reads description and alias from Ark annotations', () => {
    expect(
      readResourceMetadata({
        annotations: {
          [DESCRIPTION_ANNOTATION]: 'MCP base url',
          [ALIAS_ANNOTATION]: 'mcp-url',
        },
      }),
    ).toEqual({
      description: 'MCP base url',
      alias: 'mcp-url',
      labels: [],
    });
  });

  it('prefers typed fields over annotations', () => {
    expect(
      readResourceMetadata({
        description: 'typed',
        alias: 'typed-alias',
        annotations: {
          [DESCRIPTION_ANNOTATION]: 'annotated',
          [ALIAS_ANNOTATION]: 'annotated-alias',
        },
      }),
    ).toMatchObject({ description: 'typed', alias: 'typed-alias' });
  });

  it('returns nulls when neither source has metadata', () => {
    expect(readResourceMetadata({})).toEqual({
      description: null,
      alias: null,
      labels: [],
    });
  });

  it('ignores unrelated annotations', () => {
    expect(
      readResourceMetadata({
        annotations: {
          'kubectl.kubernetes.io/last-applied-configuration': '{}',
        },
      }),
    ).toEqual({ description: null, alias: null, labels: [] });
  });
});

describe('normaliseLabels', () => {
  it('passes through an array of labels', () => {
    expect(normaliseLabels(['prod', 'eu'])).toEqual(['prod', 'eu']);
  });

  it('takes the keys of a Kubernetes label map', () => {
    expect(normaliseLabels({ prod: '', eu: '' })).toEqual(['prod', 'eu']);
  });

  it('drops Ark-internal labels', () => {
    expect(
      normaliseLabels({ 'ark.mckinsey.com/managed': 'true', prod: '' }),
    ).toEqual(['prod']);
  });

  it('returns an empty list for missing labels', () => {
    expect(normaliseLabels(null)).toEqual([]);
    expect(normaliseLabels(undefined)).toEqual([]);
  });
});

describe('toResourceAnnotations', () => {
  it('encodes description and alias', () => {
    expect(
      toResourceAnnotations({ description: 'MCP base url', alias: 'mcp-url' }),
    ).toEqual({
      [DESCRIPTION_ANNOTATION]: 'MCP base url',
      [ALIAS_ANNOTATION]: 'mcp-url',
    });
  });

  it('omits empty and null values', () => {
    expect(toResourceAnnotations({ description: '', alias: null })).toEqual({});
    expect(toResourceAnnotations({})).toEqual({});
  });
});

describe('toResourceLabelMap', () => {
  it('maps labels to empty-valued Kubernetes labels', () => {
    expect(toResourceLabelMap(['prod', 'eu'])).toEqual({ prod: '', eu: '' });
  });

  it('returns an empty map for missing labels', () => {
    expect(toResourceLabelMap(null)).toEqual({});
  });
});
