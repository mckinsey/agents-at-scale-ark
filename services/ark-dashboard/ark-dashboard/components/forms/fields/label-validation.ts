import * as z from 'zod';

export const LABEL_MAX_LENGTH = 57;

export const labelSchema = z
  .string()
  .min(1, { message: 'Label cannot be empty' })
  .max(LABEL_MAX_LENGTH, {
    message: `Label must be ${LABEL_MAX_LENGTH} characters or less`,
  })
  .regex(/^[a-zA-Z0-9]+$/, {
    message: 'Use only letters and digits',
  });

export const validateLabelDraft = (
  draft: string,
  labels: string[],
): string | null => {
  const label = draft.trim();
  if (!label) {
    return null;
  }
  if (labels.includes(label)) {
    return `"${label}" has already been added`;
  }
  const parsed = labelSchema.safeParse(label);
  return parsed.success ? null : parsed.error.issues[0].message;
};
