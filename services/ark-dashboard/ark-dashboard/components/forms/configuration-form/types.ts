import * as z from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

export const TAG_MAX_LENGTH = 57;

export const tagSchema = z
  .string()
  .min(1, { message: 'Label cannot be empty' })
  .max(TAG_MAX_LENGTH, {
    message: `Label must be ${TAG_MAX_LENGTH} characters or less`,
  })
  .regex(/^[a-zA-Z0-9]([-_.a-zA-Z0-9]*[a-zA-Z0-9])?$/, {
    message:
      "Use letters, digits, '-', '_' or '.', starting and ending with a letter or digit",
  });

export const configurationFormSchema = z.object({
  name: kubernetesNameSchema,
  value: z.string().min(1, { message: 'Value is required' }),
  description: z.string().optional(),
  alias: z.string().optional(),
  tags: z.array(tagSchema),
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
