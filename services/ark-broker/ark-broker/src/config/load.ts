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
  });
}
