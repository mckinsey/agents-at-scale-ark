import { describe, expect, it } from 'vitest';

import {
  OUTPUT_SCHEMA_ANNOTATION,
  OUTPUT_SCHEMA_INVALID_JSON_MESSAGE,
  OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE,
  OUTPUT_SCHEMA_ROOT_TYPE_MESSAGE,
  buildOutputSchemaAnnotationUpdate,
  formatOutputSchema,
  hasOutputSchemaAnnotation,
  supportsOutputSchema,
  toOutputSchemaAnnotations,
  validateOutputSchema,
} from '@/lib/utils/output-schema';

describe('supportsOutputSchema', () => {
  it('accepts engines named after openai-responses in any case', () => {
    expect(supportsOutputSchema('executor-openai-responses')).toBe(true);
    expect(supportsOutputSchema('openai-responses-eu')).toBe(true);
    expect(supportsOutputSchema('OpenAI-Responses')).toBe(true);
  });

  it('prefers the engine service annotation over the name', () => {
    const service = 'ark.mckinsey.com/service';
    expect(
      supportsOutputSchema('structured', {
        [service]: 'executor-openai-responses',
      }),
    ).toBe(true);
    expect(
      supportsOutputSchema('openai-responses-fork', {
        [service]: 'executor-langchain',
      }),
    ).toBe(false);
    expect(supportsOutputSchema('openai-responses', {})).toBe(true);
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

  it('accepts an object schema', () => {
    expect(validateOutputSchema('{"type":"object"}')).toBeNull();
    expect(
      validateOutputSchema(
        JSON.stringify({
          type: 'object',
          properties: {
            answer: { type: ['string', 'null'] },
            items: { type: 'array', items: { type: 'integer' } },
            choice: { anyOf: [{ type: 'number' }, { $ref: '#/$defs/x' }] },
          },
          $defs: { x: { type: 'boolean' } },
          additionalProperties: false,
        }),
      ),
    ).toBeNull();
  });

  it('requires an object at the root', () => {
    expect(validateOutputSchema('{}')).toBe(OUTPUT_SCHEMA_ROOT_TYPE_MESSAGE);
    expect(validateOutputSchema('{"type":"string"}')).toBe(
      OUTPUT_SCHEMA_ROOT_TYPE_MESSAGE,
    );
  });

  it('rejects unknown types at any depth', () => {
    expect(
      validateOutputSchema(
        '{"type":"object","properties":{"a":{"type":"strng"}}}',
      ),
    ).toBe('Unknown type "strng" at root.properties.a.');
    expect(
      validateOutputSchema(
        '{"type":"object","properties":{"a":{"type":"array","items":{"type":["string","nul"]}}}}',
      ),
    ).toBe('Unknown type "nul" at root.properties.a.items.');
    expect(
      validateOutputSchema(
        '{"type":"object","properties":{"a":{"anyOf":[{"type":1}]}}}',
      ),
    ).toBe('Unknown type 1 at root.properties.a.anyOf[0].');
  });

  it('rejects malformed subschema containers', () => {
    expect(validateOutputSchema('{"type":"object","properties":[]}')).toBe(
      '"properties" at root must be an object.',
    );
    expect(validateOutputSchema('{"type":"object","anyOf":{}}')).toBe(
      '"anyOf" at root must be an array.',
    );
    expect(
      validateOutputSchema('{"type":"object","properties":{"a":"string"}}'),
    ).toBe('The schema at root.properties.a must be a JSON object.');
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

describe('toOutputSchemaAnnotations', () => {
  it('maps a schema to the output-schema annotation', () => {
    expect(toOutputSchemaAnnotations('{"type":"object"}')).toEqual({
      [OUTPUT_SCHEMA_ANNOTATION]: '{"type":"object"}',
    });
  });

  it('returns undefined for a blank value', () => {
    expect(toOutputSchemaAnnotations('  ')).toBeUndefined();
  });
});

describe('hasOutputSchemaAnnotation', () => {
  it('detects a non-blank annotation in any source', () => {
    expect(
      hasOutputSchemaAnnotation(null, { [OUTPUT_SCHEMA_ANNOTATION]: '{}' }),
    ).toBe(true);
    expect(
      hasOutputSchemaAnnotation({ [OUTPUT_SCHEMA_ANNOTATION]: ' ' }, undefined),
    ).toBe(false);
    expect(hasOutputSchemaAnnotation({ other: 'x' })).toBe(false);
  });
});

describe('buildOutputSchemaAnnotationUpdate', () => {
  it('sets the annotation when supported', () => {
    expect(
      buildOutputSchemaAnnotationUpdate({
        supported: true,
        engineChanged: false,
        value: '{"type":"object"}',
      }),
    ).toEqual({ [OUTPUT_SCHEMA_ANNOTATION]: '{"type":"object"}' });
  });

  it('removes the annotation when the schema is blank', () => {
    expect(
      buildOutputSchemaAnnotationUpdate({
        supported: true,
        engineChanged: false,
        value: ' ',
      }),
    ).toEqual({ [OUTPUT_SCHEMA_ANNOTATION]: null });
    expect(
      buildOutputSchemaAnnotationUpdate({
        supported: true,
        engineChanged: false,
        value: undefined,
      }),
    ).toEqual({ [OUTPUT_SCHEMA_ANNOTATION]: null });
  });

  it('removes the annotation when switching to an unsupported engine', () => {
    expect(
      buildOutputSchemaAnnotationUpdate({
        supported: false,
        engineChanged: true,
        value: '{"type":"object"}',
      }),
    ).toEqual({ [OUTPUT_SCHEMA_ANNOTATION]: null });
  });

  it('leaves annotations untouched otherwise', () => {
    expect(
      buildOutputSchemaAnnotationUpdate({
        supported: false,
        engineChanged: false,
        value: '{"type":"object"}',
      }),
    ).toBeUndefined();
    expect(
      buildOutputSchemaAnnotationUpdate({
        supported: false,
        engineChanged: true,
        value: '',
      }),
    ).toBeUndefined();
  });
});
