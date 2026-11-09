import { describe, expect, it, vi } from 'vitest';

import {
  agentFormSchema,
  createAgentFormSchema,
} from '@/components/forms/agent-form/types';

describe('agentFormSchema outputSchema', () => {
  it('accepts an empty or valid schema', () => {
    expect(agentFormSchema.safeParse({ name: 'agent' }).success).toBe(true);
    expect(
      agentFormSchema.safeParse({
        name: 'agent',
        outputSchema: '{"type":"object"}',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid schema for openai-responses engines', () => {
    const result = agentFormSchema.safeParse({
      name: 'agent',
      executionEngineName: 'executor-openai-responses',
      outputSchema: '{"type":',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['outputSchema']);
  });

  it('ignores an invalid schema when the engine does not support it', () => {
    expect(
      agentFormSchema.safeParse({
        name: 'agent',
        executionEngineName: 'executor-langchain',
        outputSchema: '{"type":',
      }).success,
    ).toBe(true);
  });

  it('uses the given support check', () => {
    const isSupported = vi.fn(() => true);
    const result = createAgentFormSchema(isSupported).safeParse({
      name: 'agent',
      executionEngineName: 'custom-engine',
      outputSchema: '{"type":',
    });

    expect(result.success).toBe(false);
    expect(isSupported).toHaveBeenCalledWith('custom-engine');
  });
});
