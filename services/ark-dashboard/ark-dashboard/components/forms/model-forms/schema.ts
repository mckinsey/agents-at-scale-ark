import { z } from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

const openaiSchema = z.object({
  name: kubernetesNameSchema,
  provider: z.literal('openai'),
  model: z.string().min(1, { message: 'Model is required' }),
  secret: z.string().min(1, { message: 'API Key is required' }),
  baseUrl: z.string().min(1, { message: 'Base URL is required' }),
});

const azureSchema = z
  .object({
    name: kubernetesNameSchema,
    provider: z.literal('azure'),
    model: z.string().min(1, { message: 'Model is required' }),
    azureAuthMethod: z.enum(['apiKey', 'managedIdentity', 'workloadIdentity']),
    secret: z.string(),
    baseUrl: z.string().min(1, { message: 'Base URL is required' }),
    azureApiVersion: z.string().nullish(),
    azureClientId: z.string(),
    azureTenantId: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.azureAuthMethod === 'apiKey' && !data.secret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secret'],
        message: 'API Key is required when using API Key auth',
      });
    }
    if (data.azureAuthMethod === 'workloadIdentity') {
      if (!data.azureClientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['azureClientId'],
          message: 'Client ID is required for Workload Identity',
        });
      }
      if (!data.azureTenantId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['azureTenantId'],
          message: 'Tenant ID is required for Workload Identity',
        });
      }
    }
  });

const bedrockSchema = z.object({
  name: kubernetesNameSchema,
  provider: z.literal('bedrock'),
  model: z.string().min(1, { message: 'Model is required' }),
  bedrockAccessKeyIdSecretName: z
    .string()
    .min(1, { message: 'Access Key ID Secret is required' }),
  bedrockSecretAccessKeySecretName: z
    .string()
    .min(1, { message: 'Secret Access Key Secret is required' }),
  region: z.string().nullish(),
  modelARN: z.string().nullish(),
});

const anthropicSchema = z.object({
  name: kubernetesNameSchema,
  provider: z.literal('anthropic'),
  model: z.string().min(1, { message: 'Model is required' }),
  secret: z.string().min(1, { message: 'API Key is required' }),
  baseUrl: z.string().min(1, { message: 'Base URL is required' }),
  anthropicVersion: z.string().nullish(),
});

export const schema = z.discriminatedUnion('provider', [
  openaiSchema,
  azureSchema,
  bedrockSchema,
  anthropicSchema,
]);

export type FormValues = z.infer<typeof schema>;
