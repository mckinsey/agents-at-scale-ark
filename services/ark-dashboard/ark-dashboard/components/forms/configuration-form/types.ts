import * as z from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

import { labelSchema, validateLabelDraft } from '../fields/label-validation';

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
