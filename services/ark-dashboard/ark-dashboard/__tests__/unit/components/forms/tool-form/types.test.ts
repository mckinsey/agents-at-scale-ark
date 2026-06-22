import { describe, expect, it } from 'vitest';

import { TOOL_TYPE_OPTIONS, toolFormSchema } from '@/components/forms/tool-form/types';

const base = {
  name: 'search-tool',
  description: 'A tool',
  inputSchema: '{}',
};

describe('toolFormSchema', () => {
  it('fails when required base fields are missing', () => {
    const result = toolFormSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map(i => i.path[0]);
      expect(fields).toEqual(
        expect.arrayContaining(['name', 'type', 'description', 'inputSchema']),
      );
    }
  });

  it('accepts a valid http tool with a url', () => {
    const result = toolFormSchema.safeParse({
      ...base,
      type: 'http',
      httpUrl: 'https://example.com/api',
    });
    expect(result.success).toBe(true);
  });

  it('requires httpUrl when type is http', () => {
    const result = toolFormSchema.safeParse({ ...base, type: 'http' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['httpUrl']);
      expect(result.error.issues[0]?.message).toBe('URL is required for HTTP type');
    }
  });

  it('requires selectedAgent when type is agent', () => {
    const result = toolFormSchema.safeParse({ ...base, type: 'agent' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['selectedAgent']);
      expect(result.error.issues[0]?.message).toBe(
        'Agent selection is required for Agent type',
      );
    }
  });

  it('requires selectedTeam when type is team', () => {
    const result = toolFormSchema.safeParse({ ...base, type: 'team' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['selectedTeam']);
      expect(result.error.issues[0]?.message).toBe(
        'Team selection is required for Team type',
      );
    }
  });

  it('accepts an mcp tool without type-specific fields', () => {
    const result = toolFormSchema.safeParse({ ...base, type: 'mcp' });
    expect(result.success).toBe(true);
  });
});

describe('TOOL_TYPE_OPTIONS', () => {
  it('exposes the four supported tool types', () => {
    expect(TOOL_TYPE_OPTIONS.map(o => o.value)).toEqual([
      'http',
      'mcp',
      'agent',
      'team',
    ]);
  });
});
