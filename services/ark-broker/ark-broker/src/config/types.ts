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

export type MessageBackend = 'memory' | 'postgres';

export type ChunkBackend = 'memory' | 'redis';

export type BackendsConfig = Readonly<{
  message: MessageBackend;
  messageVisibilityTtlSeconds: number;
  chunk: ChunkBackend;
}>;

export type DatabaseConfig = Readonly<{
  url?: string;
  poolMax: number;
  connectTimeoutMs: number;
  statementTimeoutMs: number;
  debugQueries: boolean;
  sslRootCertPath?: string;
}>;

export type RedisConfig = Readonly<{
  url?: string;
  username?: string;
  password?: string;
  tlsCaCertPath?: string;
  keyPrefix: string;
  streamTtlSeconds: number;
  connectTimeoutMs: number;
  debugCommands: boolean;
}>;

export type AppConfig = Readonly<{
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  server: ServerConfig;
  limits: LimitsConfig;
  persistence: PersistenceConfig;
  backends: BackendsConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
}>;
