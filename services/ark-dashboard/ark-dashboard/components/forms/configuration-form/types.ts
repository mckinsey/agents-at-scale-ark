import * as z from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

import {
  addLabelDraftIssue,
  aliasSchema,
  descriptionSchema,
  labelSchema,
} from '../fields/label-validation';

export const configurationFormSchema = z
  .object({
    name: kubernetesNameSchema,
    value: z.string().min(1, { message: 'Value is required' }),
    description: descriptionSchema,
    alias: aliasSchema,
    labels: z.array(labelSchema),
    labelDraft: z.string(),
  })
  .superRefine((data, ctx) => addLabelDraftIssue(ctx, data));

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
