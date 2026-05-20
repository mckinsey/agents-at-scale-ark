export type NodeEnv = 'development' | 'production' | 'test';

export type LogLevel =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'silent';

export type ServerConfig = Readonly<{
  port: number;
  host: string;
  requestTimeoutMs: number;
}>;

export type LimitsConfig = Readonly<{
  maxMessages: number;
  maxChunks: number;
  maxSpans: number;
  maxEvents: number;
}>;

export type PersistenceConfig = Readonly<{
  memoryFilePath?: string;
  streamFilePath?: string;
  traceFilePath?: string;
  eventFilePath?: string;
  sessionsFilePath?: string;
}>;

export type AppConfig = Readonly<{
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  server: ServerConfig;
  limits: LimitsConfig;
  persistence: PersistenceConfig;
}>;
