export const OUTPUT_SCHEMA_ANNOTATION =
  'executor-openai-responses.ark.mckinsey.com/output-schema';

const OPENAI_RESPONSES_ENGINE_MARKER = 'openai-responses';

export const OUTPUT_SCHEMA_INVALID_JSON_MESSAGE = 'Enter valid JSON.';
export const OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE =
  'The schema must be a JSON object.';

export function supportsOutputSchema(
  executionEngineName: string | null | undefined,
): boolean {
  return Boolean(executionEngineName?.includes(OPENAI_RESPONSES_ENGINE_MARKER));
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

export function validateOutputSchema(value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = parseJson(value);
  if (!parsed.ok) {
    return OUTPUT_SCHEMA_INVALID_JSON_MESSAGE;
  }
  if (
    typeof parsed.value !== 'object' ||
    parsed.value === null ||
    Array.isArray(parsed.value)
  ) {
    return OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE;
  }
  return null;
}

export function formatOutputSchema(value: string): string {
  if (validateOutputSchema(value) || !value.trim()) {
    return value;
  }
  return JSON.stringify(JSON.parse(value), null, 2);
}

export function toOutputSchemaAnnotations(
  value: string,
): Record<string, string> | undefined {
  return value.trim() ? { [OUTPUT_SCHEMA_ANNOTATION]: value } : undefined;
}

export function buildOutputSchemaAnnotationUpdate(
  executionEngineName: string | null | undefined,
  value: string | undefined,
): Record<string, string | null> | undefined {
  if (!supportsOutputSchema(executionEngineName)) {
    return undefined;
  }
  return { [OUTPUT_SCHEMA_ANNOTATION]: value?.trim() ? value : null };
}
