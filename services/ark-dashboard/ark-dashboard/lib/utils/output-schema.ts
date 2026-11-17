export const OUTPUT_SCHEMA_ANNOTATION =
  'executor-openai-responses.ark.mckinsey.com/output-schema';

const SERVICE_ANNOTATION = 'ark.mckinsey.com/service';
const OPENAI_RESPONSES_SERVICE = 'executor-openai-responses';
const OPENAI_RESPONSES_ENGINE_MARKER = 'openai-responses';

const JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
]);
const SUBSCHEMA_KEYWORDS = ['items', 'additionalProperties', 'not'];
const SUBSCHEMA_LIST_KEYWORDS = ['anyOf', 'allOf', 'oneOf', 'prefixItems'];
const SUBSCHEMA_MAP_KEYWORDS = ['properties', '$defs', 'definitions'];

export const OUTPUT_SCHEMA_INVALID_JSON_MESSAGE = 'Enter valid JSON.';
export const OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE =
  'The schema must be a JSON object.';
export const OUTPUT_SCHEMA_ROOT_TYPE_MESSAGE =
  'The root schema must have "type": "object".';

export function supportsOutputSchema(
  executionEngineName: string | null | undefined,
  executionEngineAnnotations?: Record<string, string> | null,
): boolean {
  if (!executionEngineName) {
    return false;
  }
  const service = executionEngineAnnotations?.[SERVICE_ANNOTATION];
  if (service) {
    return service === OPENAI_RESPONSES_SERVICE;
  }
  return executionEngineName
    .toLowerCase()
    .includes(OPENAI_RESPONSES_ENGINE_MARKER);
}

export function hasOutputSchemaAnnotation(
  ...annotationSources: (Record<string, string> | null | undefined)[]
): boolean {
  return annotationSources.some(annotations =>
    Boolean(annotations?.[OUTPUT_SCHEMA_ANNOTATION]?.trim()),
  );
}

function parseJson(
  value: string,
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findTypeError(type: unknown, path: string): string | null {
  const types = Array.isArray(type) ? type : [type];
  const unknownType = types.find(
    entry => typeof entry !== 'string' || !JSON_SCHEMA_TYPES.has(entry),
  );
  if (unknownType === undefined) {
    return null;
  }
  return `Unknown type ${JSON.stringify(unknownType)} at ${path}.`;
}

function findListError(
  schema: Record<string, unknown>,
  path: string,
): string | null {
  for (const keyword of SUBSCHEMA_LIST_KEYWORDS) {
    if (!(keyword in schema)) {
      continue;
    }
    const entries = schema[keyword];
    if (!Array.isArray(entries)) {
      return `"${keyword}" at ${path} must be an array.`;
    }
    const error = firstError(entries, (entry, index) =>
      findSubschemaError(entry, `${path}.${keyword}[${index}]`),
    );
    if (error) {
      return error;
    }
  }
  return null;
}

function findMapError(
  schema: Record<string, unknown>,
  path: string,
): string | null {
  for (const keyword of SUBSCHEMA_MAP_KEYWORDS) {
    if (!(keyword in schema)) {
      continue;
    }
    const entries = schema[keyword];
    if (!isPlainObject(entries)) {
      return `"${keyword}" at ${path} must be an object.`;
    }
    const error = firstError(Object.entries(entries), ([name, entry]) =>
      findSubschemaError(entry, `${path}.${keyword}.${name}`),
    );
    if (error) {
      return error;
    }
  }
  return null;
}

function firstError<T>(
  items: readonly T[],
  check: (item: T, index: number) => string | null,
): string | null {
  for (const [index, item] of items.entries()) {
    const error = check(item, index);
    if (error) {
      return error;
    }
  }
  return null;
}

function findSubschemaError(schema: unknown, path: string): string | null {
  if (typeof schema === 'boolean') {
    return null;
  }
  if (!isPlainObject(schema)) {
    return `The schema at ${path} must be a JSON object.`;
  }
  const typeError = 'type' in schema ? findTypeError(schema.type, path) : null;
  const keywordError = firstError(
    SUBSCHEMA_KEYWORDS.filter(keyword => keyword in schema),
    keyword => findSubschemaError(schema[keyword], `${path}.${keyword}`),
  );
  return (
    typeError ??
    keywordError ??
    findListError(schema, path) ??
    findMapError(schema, path)
  );
}

export function validateOutputSchema(value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = parseJson(value);
  if (!parsed.ok) {
    return OUTPUT_SCHEMA_INVALID_JSON_MESSAGE;
  }
  if (!isPlainObject(parsed.value)) {
    return OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE;
  }
  if (parsed.value.type !== 'object') {
    return OUTPUT_SCHEMA_ROOT_TYPE_MESSAGE;
  }
  return findSubschemaError(parsed.value, 'root');
}

export function formatOutputSchema(value: string): string {
  const parsed = parseJson(value);
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return value;
  }
  return JSON.stringify(parsed.value, null, 2);
}

export function toOutputSchemaAnnotations(
  value: string,
): Record<string, string> | undefined {
  return value.trim() ? { [OUTPUT_SCHEMA_ANNOTATION]: value } : undefined;
}

export function buildOutputSchemaAnnotationUpdate({
  supported,
  engineChanged,
  value,
}: {
  supported: boolean;
  engineChanged: boolean;
  value: string | undefined;
}): Record<string, string | null> | undefined {
  if (supported) {
    return { [OUTPUT_SCHEMA_ANNOTATION]: value?.trim() ? value : null };
  }
  if (engineChanged && value?.trim()) {
    return { [OUTPUT_SCHEMA_ANNOTATION]: null };
  }
  return undefined;
}
