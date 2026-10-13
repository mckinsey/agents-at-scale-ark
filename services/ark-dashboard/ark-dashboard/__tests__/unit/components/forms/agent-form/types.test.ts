import { describe, expect, it } from 'vitest';

import { agentFormSchema } from '@/components/forms/agent-form/types';

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

  it('rejects an invalid schema', () => {
    const result = agentFormSchema.safeParse({
      name: 'agent',
      outputSchema: '{"type":',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['outputSchema']);
  });
});
