import { describe, expect, it } from 'vitest';

import {
  agentParametersChanged,
  toolCrdName,
} from '@/components/forms/agent-form/utils';
import type { Parameter } from '@/components/ui/parameter-editor';
import type { AgentTool } from '@/lib/services';

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

// Mirrors AgentTool.GetToolCRDName() in the operator. The form matches agent
// tools against the Tool list by this name; using the exposed alias instead
// listed every partial tool as unavailable.
describe('toolCrdName', () => {
  const tool = (overrides: Partial<AgentTool> = {}): AgentTool => ({
    type: 'custom',
    name: 'get-coordinates',
    ...overrides,
  });

  it('returns the tool name when there is no partial', () => {
    expect(toolCrdName(tool())).toBe('get-coordinates');
  });

  it('returns the underlying Tool name for a partial', () => {
    expect(
      toolCrdName(
        tool({
          name: 'get-chicago-coordinates',
          partial: { name: 'get-coordinates' },
        }),
      ),
    ).toBe('get-coordinates');
  });

  it('falls back to the tool name when the partial names no tool', () => {
    expect(toolCrdName(tool({ partial: { name: null } }))).toBe(
      'get-coordinates',
    );
  });
});
