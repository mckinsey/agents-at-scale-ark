export const QUERY_TIMEOUT_ERROR_MESSAGE =
  'Use a whole number of minutes greater than zero.';

export function formatQueryTimeoutMinutes(value: string): string {
  return `${Number.parseInt(value, 10) || ''}`;
}

export function validateQueryTimeoutMinutes(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0) {
    return QUERY_TIMEOUT_ERROR_MESSAGE;
  }
  return null;
}
