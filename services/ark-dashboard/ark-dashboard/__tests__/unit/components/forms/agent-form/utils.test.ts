import { describe, expect, it } from 'vitest';

import { agentParametersChanged } from '@/components/forms/agent-form/utils';
import type { Parameter } from '@/components/ui/parameter-editor';

const queryParam = (overrides: Partial<Parameter> = {}): Parameter => ({
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
