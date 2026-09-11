import * as z from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

import {
  addLabelDraftIssue,
  addLabelsListIssue,
  aliasSchema,
  descriptionSchema,
} from '../fields/label-validation';

export const SecretFormMode = {
  CREATE: 'create',
  EDIT: 'edit',
} as const;

export type SecretFormMode = (typeof SecretFormMode)[keyof typeof SecretFormMode];

export function createSecretFormSchema(
  mode: SecretFormMode,
  getExistingLabels: () => readonly string[] = () => [],
) {
  return z
    .object({
      name: kubernetesNameSchema,
      password: z.string(),
      description: descriptionSchema,
      alias: aliasSchema,
      labels: z.array(z.string()),
      labelDraft: z.string(),
    })
    .superRefine((data, ctx) => {
      if (mode === SecretFormMode.CREATE && data.password.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Value is required',
          path: ['password'],
        });
      }

      addLabelsListIssue(ctx, data, getExistingLabels());
      addLabelDraftIssue(ctx, data);
    });
}

export type SecretFormValues = z.infer<ReturnType<typeof createSecretFormSchema>>;

export interface SecretFormProps {
  mode: SecretFormMode;
  secretName?: string;
  onSuccess?: () => void;
}
