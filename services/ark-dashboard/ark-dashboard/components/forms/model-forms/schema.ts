import { z } from 'zod';

import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

const openaiSchema = z.object({
  name: kubernetesNameSchema,
  provider: z.literal('openai'),
  model: z.string().min(1, { message: 'Model is required' }),
  secret: z.string().min(1, { message: 'API Key is required' }),
  baseUrl: z.string().min(1, { message: 'Base URL is required' }),
});

const azureSchema = z.object({
  name: kubernetesNameSchema,
  provider: z.literal('azure'),
  model: z.string().min(1, { message: 'Model is required' }),
  secret: z.string().min(1, { message: 'API Key is required' }),
  baseUrl: z.string().min(1, { message: 'Base URL is required' }),
  azureApiVersion: z.string().nullish(),
});

const bedrockAuthMethodSchema = z.enum(['keys', 'bearer']);

const bedrockSchema = z
  .object({
    name: kubernetesNameSchema,
    provider: z.literal('bedrock'),
    model: z.string().min(1, { message: 'Model is required' }),
    bedrockAuthMethod: bedrockAuthMethodSchema,
    bedrockAccessKeyIdSecretName: z.string().optional(),
    bedrockSecretAccessKeySecretName: z.string().optional(),
    bedrockBearerTokenSecretName: z.string().optional(),
    region: z.string().nullish(),
    baseUrl: z.string().nullish(),
    modelARN: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.bedrockAuthMethod === 'keys') {
      if (!data.bedrockAccessKeyIdSecretName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Access Key ID Secret is required for API Keys authentication',
          path: ['bedrockAccessKeyIdSecretName'],
        });
      }
      if (!data.bedrockSecretAccessKeySecretName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Secret Access Key Secret is required for API Keys authentication',
          path: ['bedrockSecretAccessKeySecretName'],
        });
      }
    } else if (data.bedrockAuthMethod === 'bearer') {
      if (!data.bedrockBearerTokenSecretName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Bearer Token Secret is required for Bearer Token authentication',
          path: ['bedrockBearerTokenSecretName'],
        });
      }
    }
  });

export const schema = z.discriminatedUnion('provider', [
  openaiSchema,
  azureSchema,
  bedrockSchema,
]);

export type FormValues = z.infer<typeof schema>;
