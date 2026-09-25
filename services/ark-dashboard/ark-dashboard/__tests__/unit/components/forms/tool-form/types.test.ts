import { describe, expect, it } from 'vitest';

import {
  INLINE_LANGUAGE_OPTIONS,
  MAX_INLINE_SOURCE_BYTES,
  TOOL_TYPE_OPTIONS,
  ToolFormMode,
  inlineSourceByteLength,
  toolFormSchema,
} from '@/components/forms/tool-form/types';

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
      expect(result.error.issues[0]?.message).toBe(
        'URL is required for HTTP type',
      );
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

  it('accepts a valid inline tool', () => {
    const result = toolFormSchema.safeParse({
      ...base,
      type: 'inline',
      inlineSource: 'print(1)',
      inlineLanguage: 'python',
    });
    expect(result.success).toBe(true);
  });

  it('requires a language when type is inline', () => {
    const result = toolFormSchema.safeParse({
      ...base,
      type: 'inline',
      inlineSource: 'print(1)',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['inlineLanguage']);
      expect(result.error.issues[0]?.message).toBe(
        'Language is required for Inline type',
      );
    }
  });

  it('rejects whitespace-only inline source', () => {
    const result = toolFormSchema.safeParse({
      ...base,
      type: 'inline',
      inlineLanguage: 'bash',
      inlineSource: '   \n\t',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['inlineSource']);
    }
  });

  it('accepts inline source of exactly the byte limit', () => {
    const result = toolFormSchema.safeParse({
      ...base,
      type: 'inline',
      inlineLanguage: 'bash',
      inlineSource: 'a'.repeat(MAX_INLINE_SOURCE_BYTES),
    });
    expect(result.success).toBe(true);
  });

  it('rejects inline source over the byte limit', () => {
    const result = toolFormSchema.safeParse({
      ...base,
      type: 'inline',
      inlineLanguage: 'bash',
      inlineSource: 'a'.repeat(MAX_INLINE_SOURCE_BYTES + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['inlineSource']);
    }
  });

  it('counts multibyte inline source in UTF-8 bytes, not characters', () => {
    // Half the character count of the limit, but over it in bytes.
    const source = '\u00e9'.repeat(MAX_INLINE_SOURCE_BYTES / 2 + 1);
    expect(source.length).toBeLessThan(MAX_INLINE_SOURCE_BYTES);
    const result = toolFormSchema.safeParse({
      ...base,
      type: 'inline',
      inlineLanguage: 'bash',
      inlineSource: source,
    });
    expect(result.success).toBe(false);
  });

  it('leaves non-inline types unaffected by the inline rules', () => {
    const result = toolFormSchema.safeParse({ ...base, type: 'mcp' });
    expect(result.success).toBe(true);
  });
});

describe('inlineSourceByteLength', () => {
  it('measures UTF-8 bytes', () => {
    expect(inlineSourceByteLength('abc')).toBe(3);
    expect(inlineSourceByteLength('\u00e9')).toBe(2);
    expect(inlineSourceByteLength('\u{1F600}')).toBe(4);
  });
});

describe('INLINE_LANGUAGE_OPTIONS', () => {
  it('offers exactly the supported languages and no default', () => {
    expect(INLINE_LANGUAGE_OPTIONS.map(o => o.value)).toEqual([
      'bash',
      'python',
      'node',
      'ts',
    ]);
  });
});

describe('ToolFormMode', () => {
  it('exposes create and view modes', () => {
    expect(ToolFormMode.CREATE).toBe('create');
    expect(ToolFormMode.VIEW).toBe('view');
    expect(ToolFormMode.EDIT).toBe('edit');
  });
});

describe('TOOL_TYPE_OPTIONS', () => {
  it('exposes the supported tool types', () => {
    expect(TOOL_TYPE_OPTIONS.map(o => o.value)).toEqual([
      'http',
      'mcp',
      'agent',
      'team',
      'inline',
    ]);
  });
});
