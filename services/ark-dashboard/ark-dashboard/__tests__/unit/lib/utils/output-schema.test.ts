import { describe, expect, it } from 'vitest';

import {
  OUTPUT_SCHEMA_INVALID_JSON_MESSAGE,
  OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE,
  formatOutputSchema,
  supportsOutputSchema,
  validateOutputSchema,
} from '@/lib/utils/output-schema';

describe('supportsOutputSchema', () => {
  it('accepts engines named after openai-responses', () => {
    expect(supportsOutputSchema('executor-openai-responses')).toBe(true);
    expect(supportsOutputSchema('openai-responses-eu')).toBe(true);
  });

  it('rejects other or missing engines', () => {
    expect(supportsOutputSchema('executor-langchain')).toBe(false);
    expect(supportsOutputSchema('')).toBe(false);
    expect(supportsOutputSchema(null)).toBe(false);
    expect(supportsOutputSchema(undefined)).toBe(false);
  });
});

describe('validateOutputSchema', () => {
  it('treats an empty value as valid', () => {
    expect(validateOutputSchema('')).toBeNull();
    expect(validateOutputSchema('   ')).toBeNull();
  });

  it('accepts a JSON object', () => {
    expect(validateOutputSchema('{"type":"object"}')).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(validateOutputSchema('{"type":')).toBe(
      OUTPUT_SCHEMA_INVALID_JSON_MESSAGE,
    );
  });

  it('rejects JSON that is not an object', () => {
    expect(validateOutputSchema('[]')).toBe(OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE);
    expect(validateOutputSchema('"text"')).toBe(
      OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE,
    );
    expect(validateOutputSchema('null')).toBe(OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE);
  });
});

describe('formatOutputSchema', () => {
  it('pretty-prints a valid schema with two-space indentation', () => {
    expect(formatOutputSchema('{"type":"object","required":["a"]}')).toBe(
      '{\n  "type": "object",\n  "required": [\n    "a"\n  ]\n}',
    );
  });

  it('returns invalid or empty input unchanged', () => {
    expect(formatOutputSchema('{"type":')).toBe('{"type":');
    expect(formatOutputSchema('')).toBe('');
  });
});
