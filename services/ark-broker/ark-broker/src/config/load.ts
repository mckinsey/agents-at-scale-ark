import type {AppConfig} from './types.js';
import {envSchema} from './schema.js';

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.parse(env);
  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    server: Object.freeze({
      port: parsed.PORT,
      host: parsed.HOST,
      requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
    }),
    limits: Object.freeze({
      maxMessages: parsed.MAX_MESSAGES,
      maxChunks: parsed.MAX_CHUNKS,
      maxSpans: parsed.MAX_SPANS,
      maxEvents: parsed.MAX_EVENTS,
    }),
    persistence: Object.freeze({
      memoryFilePath: parsed.MEMORY_FILE_PATH,
      streamFilePath: parsed.STREAM_FILE_PATH,
      traceFilePath: parsed.TRACE_FILE_PATH,
      eventFilePath: parsed.EVENT_FILE_PATH,
      sessionsFilePath: parsed.SESSIONS_FILE_PATH,
    }),
    backends: Object.freeze({
      message: parsed.MESSAGE_BACKEND,
      messageVisibilityTtlSeconds: parsed.MESSAGE_VISIBILITY_TTL_SECONDS,
      chunk: parsed.CHUNK_BACKEND,
    }),
    database: Object.freeze({
      url: parsed.DATABASE_URL,
      poolMax: parsed.DATABASE_POOL_MAX,
      connectTimeoutMs: parsed.DATABASE_CONNECT_TIMEOUT_MS,
      statementTimeoutMs: parsed.DATABASE_STATEMENT_TIMEOUT_MS,
      debugQueries: parsed.DATABASE_DEBUG_QUERIES,
      sslRootCertPath: parsed.DATABASE_SSL_ROOT_CERT_PATH,
    }),
    redis: Object.freeze({
      url: parsed.REDIS_URL,
      username: parsed.REDIS_USERNAME,
      password: parsed.REDIS_PASSWORD,
      tlsCaCertPath: parsed.REDIS_TLS_CA_CERT_PATH,
      keyPrefix: parsed.REDIS_KEY_PREFIX,
      streamTtlSeconds: parsed.REDIS_STREAM_TTL_SECONDS,
      connectTimeoutMs: parsed.REDIS_CONNECT_TIMEOUT_MS,
      debugCommands: parsed.REDIS_DEBUG_COMMANDS,
    }),
  });
}
