import { describe, expect, it } from 'vitest';

import {
  agentParametersChanged,
  buildAgentOverrides,
  getModelOverrideHeaders,
} from '@/components/forms/agent-form/utils';
import type { Parameter } from '@/components/ui/parameter-editor';

const queryParam = (overrides: Partial<Parameter> = {}): Parameter => ({
  id: 'query-param',
  name: 'queryWord',
  source: 'queryParameter',
  value: '',
  queryParameterName: 'queryWord',
  overrideQueryName: false,
  ...overrides,
});

describe('agentParametersChanged', () => {
  it('returns false when nothing changed', () => {
    const initial = [queryParam()];
    const current = [queryParam()];
    expect(agentParametersChanged(current, initial)).toBe(false);
  });

  it('returns true when the parameter count changes', () => {
    expect(agentParametersChanged([queryParam()], [])).toBe(true);
  });

  it('returns true when name changes', () => {
    expect(
      agentParametersChanged([queryParam({ name: 'other' })], [queryParam()]),
    ).toBe(true);
  });

  it('returns true when value changes', () => {
    expect(
      agentParametersChanged([queryParam({ value: 'x' })], [queryParam()]),
    ).toBe(true);
  });

  it('returns true when source changes', () => {
    expect(
      agentParametersChanged([queryParam({ source: 'value' })], [queryParam()]),
    ).toBe(true);
  });

  // The Save-disabled bug: editing ONLY the override must register as a change.
  it('returns true when the overridden query parameter name changes', () => {
    expect(
      agentParametersChanged(
        [queryParam({ overrideQueryName: true, queryParameterName: 'muting' })],
        [queryParam()],
      ),
    ).toBe(true);
  });

  it('returns true when the override toggle flips', () => {
    expect(
      agentParametersChanged(
        [queryParam({ overrideQueryName: true })],
        [queryParam({ overrideQueryName: false })],
      ),
    ).toBe(true);
  });
});

describe('agent model header overrides', () => {
  const header = (name: string) => ({ name, value: { value: 'v' } });
  const existing = [
    { resourceType: 'model', headers: [header('A')] },
    { resourceType: 'model', headers: [header('B')] },
    {
      resourceType: 'model',
      labelSelector: { matchLabels: { tier: 'premium' } },
      headers: [header('C')],
    },
    { resourceType: 'mcpserver', headers: [header('D')] },
  ];

  it('edits only selector-less model overrides', () => {
    expect(getModelOverrideHeaders(existing)).toEqual([
      header('A'),
      header('B'),
    ]);
    expect(getModelOverrideHeaders(undefined)).toEqual([]);
  });

  it('replaces editable overrides and keeps the rest', () => {
    expect(buildAgentOverrides(existing, [header('E')])).toEqual([
      { resourceType: 'model', headers: [header('E')] },
      existing[2],
      existing[3],
    ]);
    expect(buildAgentOverrides(existing, [])).toEqual([
      existing[2],
      existing[3],
    ]);
  });
});
