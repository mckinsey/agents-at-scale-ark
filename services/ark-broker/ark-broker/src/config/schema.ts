import {z} from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  PORT: z.coerce.number().int().nonnegative().default(8080),
  HOST: z.string().default('0.0.0.0'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(0),
  MAX_MESSAGES: z.coerce.number().int().nonnegative().default(0),
  MAX_CHUNKS: z.coerce.number().int().nonnegative().default(0),
  MAX_SPANS: z.coerce.number().int().nonnegative().default(0),
  MAX_EVENTS: z.coerce.number().int().nonnegative().default(0),
  MEMORY_FILE_PATH: z.string().min(1).optional(),
  STREAM_FILE_PATH: z.string().min(1).optional(),
  TRACE_FILE_PATH: z.string().min(1).optional(),
  EVENT_FILE_PATH: z.string().min(1).optional(),
  SESSIONS_FILE_PATH: z.string().min(1).optional(),
});

export type ParsedEnv = z.infer<typeof envSchema>;
