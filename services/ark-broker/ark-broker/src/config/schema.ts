import {z} from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('production'),
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
    MESSAGE_BACKEND: z.enum(['memory', 'postgres']).default('memory'),
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30000),
    MESSAGE_VISIBILITY_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(2592000),
    DATABASE_DEBUG_QUERIES: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((data, ctx) => {
    if (data.MESSAGE_BACKEND === 'postgres' && !data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL is required when MESSAGE_BACKEND=postgres',
        path: ['DATABASE_URL'],
      });
    }
  });

export type ParsedEnv = z.infer<typeof envSchema>;
