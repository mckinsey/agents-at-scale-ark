/**
 * JSON utility functions for parsing, formatting, and validation
 */

export type ResponseForView = {
  body: unknown | string; // extracted text you show today
  headers?: Record<string, string | undefined>; // optional
  rawJson?: unknown | string; // original JSON envelope
};

export type ViewMode = 'text' | 'markdown' | 'json' | 'chat';

/**
 * Check if content type indicates JSON
 */
export function isJsonContentType(
  headers?: Record<string, string | undefined>,
) {
  if (!headers) return false;
  const ct = (
    headers['content-type'] ||
    headers['Content-Type'] ||
    ''
  ).toLowerCase();
  return ct.includes('application/json') || ct.includes('application/ld+json');
}

/**
 * Check if a string is valid JSON
 */
export function isParsableJson(s: string) {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine if a response should be treated as JSON
 */
export function responseIsJson(res: ResponseForView) {
  if (res.rawJson !== undefined) return true;
  const headerJson = isJsonContentType(res.headers);
  const bodyIsObject = typeof res.body === 'object' && res.body !== null;
  const bodyIsJsonString =
    typeof res.body === 'string' && isParsableJson(res.body);
  return headerJson || bodyIsObject || bodyIsJsonString;
}

/**
 * Default to JSON when JSON is detected (your ask).
 */
export function pickDefaultView(
  res: ResponseForView,
  fallback: ViewMode = 'text',
): ViewMode {
  return responseIsJson(res) ? 'json' : fallback;
}

/**
 * Safely parse JSON string, returning undefined if parsing fails
 */
export function tryParseJson<T = unknown>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/**
 * Safely stringify an object with pretty formatting
 */
export function safeStringify(value: unknown, space = 2): string {
  try {
    if (typeof value === 'string') {
      const parsed = tryParseJson(value);
      return parsed ? JSON.stringify(parsed, null, space) : value;
    }
    return JSON.stringify(value, null, space);
  } catch {
    return String(value);
  }
}

/**
 * Check if a string is valid JSON (alias for isParsableJson)
 */
export function isValidJson(text: string): boolean {
  return isParsableJson(text);
}

/**
 * Get the size of a JSON object in bytes (approximate)
 */
export function getJsonSize(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

/**
 * Format JSON with truncation for large objects
 */
export function formatJsonWithTruncation(
  value: unknown,
  maxBytes = 300_000,
  space = 2,
): { formatted: string; truncated: boolean; originalSize: number } {
  const formatted = safeStringify(value, space);
  const originalSize = formatted.length;
  const truncated = originalSize > maxBytes;

  if (truncated) {
    return {
      formatted: formatted.slice(0, maxBytes) + '\n… (truncated)',
      truncated: true,
      originalSize,
    };
  }

  return {
    formatted,
    truncated: false,
    originalSize,
  };
}

/**
 * Extract nested value from JSON object using dot notation
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  try {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  } catch {
    return undefined;
  }
}

/**
 * Deep clone a JSON-serializable object
 */
export function deepClone<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    throw new Error('Object is not JSON serializable');
  }
}

/**
 * Compare two JSON objects for deep equality
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Flatten a nested JSON object
 */
export function flattenJson(
  obj: unknown,
  prefix = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenJson(value, newKey));
      } else {
        result[newKey] = value;
      }
    }
  } else {
    result[prefix] = obj;
  }

  return result;
}

/**
 * Extract all unique keys from a JSON object (including nested)
 */
export function extractAllKeys(obj: unknown): string[] {
  const keys = new Set<string>();

  function traverse(value: unknown, path = '') {
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          traverse(item, `${path}[${index}]`);
        });
      } else {
        for (const [key, val] of Object.entries(value)) {
          const newPath = path ? `${path}.${key}` : key;
          keys.add(newPath);
          traverse(val, newPath);
        }
      }
    }
  }

  traverse(obj);
  return Array.from(keys).sort();
}
