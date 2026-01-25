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

// Bedrock supports two authentication modes:
// 1. API Key (bearer token) - simpler, recommended for most use cases
// 2. Access Key + Secret Access Key - traditional AWS credentials
const bedrockSchema = z
  .object({
    name: kubernetesNameSchema,
    provider: z.literal('bedrock'),
    model: z.string().min(1, { message: 'Model is required' }),
    bedrockAuthMode: z.enum(['apiKey', 'accessKey']),
    bedrockApiKeySecretName: z.string().nullish(),
    bedrockAccessKeyIdSecretName: z.string().nullish(),
    bedrockSecretAccessKeySecretName: z.string().nullish(),
    region: z.string().nullish(),
    modelARN: z.string().nullish(),
  })
  .refine(
    data => {
      if (data.bedrockAuthMode === 'apiKey') {
        return !!data.bedrockApiKeySecretName;
      }
      return (
        !!data.bedrockAccessKeyIdSecretName &&
        !!data.bedrockSecretAccessKeySecretName
      );
    },
    {
      message:
        'API Key is required for API Key auth mode, or Access Key ID and Secret Access Key are required for Access Key auth mode',
      path: ['bedrockApiKeySecretName'],
    },
  );

export const schema = z.discriminatedUnion('provider', [
  openaiSchema,
  azureSchema,
  bedrockSchema,
]);

export type FormValues = z.infer<typeof schema>;
