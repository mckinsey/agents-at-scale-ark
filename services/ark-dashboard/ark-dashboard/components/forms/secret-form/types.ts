import { z } from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';
import { labelsSchema } from '@/lib/utils/label-validation';

export const secretFormSchema = z.object({
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

export type SecretFormValues = z.infer<typeof secretFormSchema>;

export const SecretFormMode = {
  CREATE: 'create',
  EDIT: 'edit',
} as const;

export type SecretFormMode =
  (typeof SecretFormMode)[keyof typeof SecretFormMode];

export interface SecretFormProps {
  readonly mode: SecretFormMode;
  readonly secretName?: string;
  readonly onSuccess?: () => void;
  readonly onCancel?: () => void;
}
