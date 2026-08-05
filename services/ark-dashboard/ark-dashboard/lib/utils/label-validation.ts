import { z } from 'zod';

export const LABEL_PATTERN = /^[a-zA-Z0-9]+$/;

export const LABEL_ERROR_MESSAGE =
  'Labels can only contain letters and numbers';

export const labelSchema = z
  .string()
  .min(1, { message: 'Label cannot be empty' })
  .max(63, { message: 'Label must be 63 characters or less' })
  .regex(LABEL_PATTERN, { message: LABEL_ERROR_MESSAGE });

export const labelsSchema = z.array(labelSchema);

export function isValidLabel(value: string): boolean {
  return labelSchema.safeParse(value).success;
}

export function getLabelError(value: string): string | null {
  const result = labelSchema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}
