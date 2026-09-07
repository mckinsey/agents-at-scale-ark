import * as z from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

export const LABEL_MAX_LENGTH = 57;

export const labelSchema = z
  .string()
  .min(1, { message: 'Label cannot be empty' })
  .max(LABEL_MAX_LENGTH, {
    message: `Label must be ${LABEL_MAX_LENGTH} characters or less`,
  })
  .regex(/^[a-zA-Z0-9]([-_.a-zA-Z0-9]*[a-zA-Z0-9])?$/, {
    message:
      "Use letters, digits, '-', '_' or '.', starting and ending with a letter or digit",
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

export const configurationFormSchema = z
  .object({
    name: kubernetesNameSchema,
    value: z.string().min(1, { message: 'Value is required' }),
    description: z
      .string()
      .max(256, { message: 'Description must be 256 characters or less' })
      .optional(),
    alias: z.string().optional(),
    labels: z.array(labelSchema),
    labelDraft: z.string(),
  })
  .superRefine((data, ctx) => {
    const message = validateLabelDraft(data.labelDraft, data.labels);
    if (message) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['labelDraft'],
      });
    }
  });

export type ConfigurationFormValues = z.infer<typeof configurationFormSchema>;

export const ConfigurationFormMode = {
  CREATE: 'create',
  EDIT: 'edit',
} as const;

export type ConfigurationFormMode =
  (typeof ConfigurationFormMode)[keyof typeof ConfigurationFormMode];

export interface ConfigurationFormProps {
  mode: ConfigurationFormMode;
  configurationName?: string;
  onSuccess?: () => void;
}
