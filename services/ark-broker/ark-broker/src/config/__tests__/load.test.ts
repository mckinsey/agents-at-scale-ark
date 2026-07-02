import {loadConfig} from '../load.js';

describe('loadConfig', () => {
  it('parses an empty env using defaults', () => {
    const cfg = loadConfig({});

    expect(cfg.nodeEnv).toBe('production');
    expect(cfg.logLevel).toBe('info');
    expect(cfg.server.port).toBe(8080);
    expect(cfg.server.host).toBe('0.0.0.0');
    expect(cfg.server.requestTimeoutMs).toBe(0);
    expect(cfg.limits.maxMessages).toBe(0);
    expect(cfg.limits.maxChunks).toBe(0);
    expect(cfg.limits.maxSpans).toBe(0);
    expect(cfg.limits.maxEvents).toBe(0);
    expect(cfg.persistence.memoryFilePath).toBeUndefined();
    expect(cfg.persistence.streamFilePath).toBeUndefined();
    expect(cfg.persistence.traceFilePath).toBeUndefined();
    expect(cfg.persistence.eventFilePath).toBeUndefined();
    expect(cfg.persistence.sessionsFilePath).toBeUndefined();
    expect(cfg.backends.message).toBe('memory');
    expect(cfg.backends.messageVisibilityTtlSeconds).toBe(2592000);
    expect(cfg.backends.chunk).toBe('memory');
    expect(cfg.database.url).toBeUndefined();
    expect(cfg.database.poolMax).toBe(10);
    expect(cfg.database.connectTimeoutMs).toBe(10000);
    expect(cfg.database.statementTimeoutMs).toBe(30000);
    expect(cfg.database.debugQueries).toBe(false);
    expect(cfg.redis.url).toBeUndefined();
    expect(cfg.redis.username).toBeUndefined();
    expect(cfg.redis.password).toBeUndefined();
    expect(cfg.redis.tlsCaCertPath).toBeUndefined();
    expect(cfg.redis.keyPrefix).toBe('ark-broker');
    expect(cfg.redis.streamTtlSeconds).toBe(3600);
    expect(cfg.redis.connectTimeoutMs).toBe(10000);
    expect(cfg.redis.debugCommands).toBe(false);
  });

  it('honors provided values', () => {
    const cfg = loadConfig({
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      PORT: '9000',
      HOST: '127.0.0.1',
      REQUEST_TIMEOUT_MS: '5000',
      MAX_MESSAGES: '100',
      MAX_CHUNKS: '500',
      MAX_SPANS: '50',
      MAX_EVENTS: '200',
      MEMORY_FILE_PATH: '/tmp/m.json',
      STREAM_FILE_PATH: '/tmp/s.json',
      TRACE_FILE_PATH: '/tmp/t.json',
      EVENT_FILE_PATH: '/tmp/e.json',
      SESSIONS_FILE_PATH: '/tmp/se.json',
    });

    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.logLevel).toBe('debug');
    expect(cfg.server.port).toBe(9000);
    expect(cfg.server.host).toBe('127.0.0.1');
    expect(cfg.server.requestTimeoutMs).toBe(5000);
    expect(cfg.limits.maxMessages).toBe(100);
    expect(cfg.limits.maxChunks).toBe(500);
    expect(cfg.limits.maxSpans).toBe(50);
    expect(cfg.limits.maxEvents).toBe(200);
    expect(cfg.persistence.memoryFilePath).toBe('/tmp/m.json');
    expect(cfg.persistence.streamFilePath).toBe('/tmp/s.json');
    expect(cfg.persistence.traceFilePath).toBe('/tmp/t.json');
    expect(cfg.persistence.eventFilePath).toBe('/tmp/e.json');
    expect(cfg.persistence.sessionsFilePath).toBe('/tmp/se.json');
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({LOG_LEVEL: 'verbose'})).toThrow();
  });

  it('rejects an unknown node environment', () => {
    expect(() => loadConfig({NODE_ENV: 'staging'})).toThrow();
  });

  it('rejects a non-numeric integer field', () => {
    expect(() => loadConfig({PORT: 'eight-thousand'})).toThrow();
  });

  it('rejects negative integers', () => {
    expect(() => loadConfig({MAX_MESSAGES: '-1'})).toThrow();
  });

  it('returns a frozen object at the top level and on each slice', () => {
    const cfg = loadConfig({});

    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen(cfg.server)).toBe(true);
    expect(Object.isFrozen(cfg.limits)).toBe(true);
    expect(Object.isFrozen(cfg.persistence)).toBe(true);
    expect(Object.isFrozen(cfg.backends)).toBe(true);
    expect(Object.isFrozen(cfg.database)).toBe(true);
    expect(Object.isFrozen(cfg.redis)).toBe(true);
  });

  it('throws when attempting to mutate the frozen object', () => {
    const cfg = loadConfig({});

    expect(() =>
      Object.defineProperty(cfg, 'logLevel', {value: 'debug'})
    ).toThrow();
    expect(() =>
      Object.defineProperty(cfg.server, 'port', {value: 1234})
    ).toThrow();
    expect(() =>
      Object.defineProperty(cfg.redis, 'keyPrefix', {value: 'x'})
    ).toThrow();
  });

  describe('MESSAGE_BACKEND=postgres', () => {
    it('accepts postgres backend with DATABASE_URL', () => {
      const cfg = loadConfig({
        MESSAGE_BACKEND: 'postgres',
        DATABASE_URL: 'postgres://localhost:5432/broker',
      });

      expect(cfg.backends.message).toBe('postgres');
      expect(cfg.database.url).toBe('postgres://localhost:5432/broker');
    });

    it('rejects postgres backend without DATABASE_URL', () => {
      expect(() => loadConfig({MESSAGE_BACKEND: 'postgres'})).toThrow();
    });

    it('honors custom database pool and timeout values', () => {
      const cfg = loadConfig({
        MESSAGE_BACKEND: 'postgres',
        DATABASE_URL: 'postgres://localhost:5432/broker',
        DATABASE_POOL_MAX: '20',
        DATABASE_CONNECT_TIMEOUT_MS: '5000',
        DATABASE_STATEMENT_TIMEOUT_MS: '60000',
      });

      expect(cfg.database.poolMax).toBe(20);
      expect(cfg.database.connectTimeoutMs).toBe(5000);
      expect(cfg.database.statementTimeoutMs).toBe(60000);
    });

    it('honors MESSAGE_VISIBILITY_TTL_SECONDS', () => {
      const cfg = loadConfig({
        MESSAGE_BACKEND: 'postgres',
        DATABASE_URL: 'postgres://localhost:5432/broker',
        MESSAGE_VISIBILITY_TTL_SECONDS: '3600',
      });

      expect(cfg.backends.messageVisibilityTtlSeconds).toBe(3600);
    });
  });

  describe('CHUNK_BACKEND=redis', () => {
    it('accepts redis backend with REDIS_URL', () => {
      const cfg = loadConfig({
        CHUNK_BACKEND: 'redis',
        REDIS_URL: 'redis://localhost:6379',
      });

      expect(cfg.backends.chunk).toBe('redis');
      expect(cfg.redis.url).toBe('redis://localhost:6379');
    });

    it('rejects redis backend without REDIS_URL', () => {
      expect(() => loadConfig({CHUNK_BACKEND: 'redis'})).toThrow();
    });

    it('honors all redis connection options', () => {
      const cfg = loadConfig({
        CHUNK_BACKEND: 'redis',
        REDIS_URL: 'rediss://redis.example.com:6380',
        REDIS_USERNAME: 'alice',
        REDIS_PASSWORD: 'test-redis-password',
        REDIS_TLS_CA_CERT_PATH: '/certs/ca.crt',
        REDIS_KEY_PREFIX: 'my-prefix',
        REDIS_STREAM_TTL_SECONDS: '7200',
        REDIS_CONNECT_TIMEOUT_MS: '5000',
      });

      expect(cfg.redis.username).toBe('alice');
      expect(cfg.redis.password).toBe('test-redis-password');
      expect(cfg.redis.tlsCaCertPath).toBe('/certs/ca.crt');
      expect(cfg.redis.keyPrefix).toBe('my-prefix');
      expect(cfg.redis.streamTtlSeconds).toBe(7200);
      expect(cfg.redis.connectTimeoutMs).toBe(5000);
    });
  });

  describe('REDIS_DEBUG_COMMANDS', () => {
    it('defaults to false', () => {
      expect(loadConfig({}).redis.debugCommands).toBe(false);
    });

    it('parses true', () => {
      expect(
        loadConfig({REDIS_DEBUG_COMMANDS: 'true'}).redis.debugCommands
      ).toBe(true);
    });

    it('treats any non-"true" value as false', () => {
      expect(loadConfig({REDIS_DEBUG_COMMANDS: '1'}).redis.debugCommands).toBe(
        false
      );
    });
  });

  describe('DATABASE_DEBUG_QUERIES', () => {
    it('defaults to false', () => {
      expect(loadConfig({}).database.debugQueries).toBe(false);
    });

    it('parses true', () => {
      expect(
        loadConfig({DATABASE_DEBUG_QUERIES: 'true'}).database.debugQueries
      ).toBe(true);
    });

    it('parses false', () => {
      expect(
        loadConfig({DATABASE_DEBUG_QUERIES: 'false'}).database.debugQueries
      ).toBe(false);
    });

    it('treats any non-"true" value as false', () => {
      expect(
        loadConfig({DATABASE_DEBUG_QUERIES: '1'}).database.debugQueries
      ).toBe(false);
    });
  });
});
