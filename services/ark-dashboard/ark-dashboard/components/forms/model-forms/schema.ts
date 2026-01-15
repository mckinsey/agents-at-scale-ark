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

export const schema = z.discriminatedUnion('provider', [
  openaiSchema,
  azureSchema,
  bedrockSchema,
]);

export type FormValues = z.infer<typeof schema>;
