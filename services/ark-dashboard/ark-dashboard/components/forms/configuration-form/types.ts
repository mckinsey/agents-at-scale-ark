import { z } from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';
import { labelsSchema } from '@/lib/utils/label-validation';

export const configurationFormSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().max(256, {
    message: 'Description must be 256 characters or less',
  }),
  alias: z.string().refine(
    value => value === '' || kubernetesNameSchema.safeParse(value).success,
    {
      message:
        'Alias can only contain lowercase letters, numbers, hyphens, and dots',
    },
  ),
  value: z.string().min(1, { message: 'Value is required' }),
  labels: labelsSchema,
});

export type ConfigurationFormValues = z.infer<typeof configurationFormSchema>;

export const ConfigurationFormMode = {
  CREATE: 'create',
  EDIT: 'edit',
} as const;

export type ConfigurationFormMode =
  (typeof ConfigurationFormMode)[keyof typeof ConfigurationFormMode];

export interface ConfigurationFormProps {
  readonly mode: ConfigurationFormMode;
  readonly configurationName?: string;
  readonly onSuccess?: () => void;
  readonly onCancel?: () => void;
}
