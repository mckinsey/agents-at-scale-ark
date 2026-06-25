import {join} from 'path';
import {writeFileSync, readFileSync} from 'fs';
import {randomBytes} from 'crypto';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import {generate as generateCert} from 'selfsigned';
import tmp from 'tmp';
import Redis from 'ioredis';
import type {RedisClient} from '../../redis.js';

tmp.setGracefulCleanup();

export type StartedRedisTestContainer = {
  container: StartedRedisContainer;
  connectionUrl: string;
  stop: () => Promise<void>;
};

export async function startRedisContainer(): Promise<StartedRedisTestContainer> {
  const container = await new RedisContainer('redis:7-alpine').start();
  const connectionUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  return {
    container,
    connectionUrl,
    stop: async (): Promise<void> => {
      await container.stop();
    },
  };
}

export async function startRedisContainerWithAuth(): Promise<
  StartedRedisTestContainer & {password: string}
> {
  const password = randomBytes(16).toString('hex');
  const container = await new RedisContainer('redis:7-alpine')
    .withCommand(['redis-server', '--requirepass', password])
    .start();
  const connectionUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  return {
    container,
    connectionUrl,
    password,
    stop: async (): Promise<void> => {
      await container.stop();
    },
  };
}

export async function startRedisContainerTls(): Promise<
  StartedRedisTestContainer & {caCertPath: string; password: string}
> {
  const password = randomBytes(16).toString('hex');
  const notAfterDate = new Date();
  notAfterDate.setDate(notAfterDate.getDate() + 1);
  const pems = await generateCert([{name: 'commonName', value: 'localhost'}], {
    notAfterDate,
    keySize: 2048,
  });

  const certDir = tmp.dirSync({prefix: 'redis-tls-', unsafeCleanup: true});
  const keyPath = join(certDir.name, 'server.key');
  const certPath = join(certDir.name, 'server.crt');
  const caCertPath = join(certDir.name, 'ca.crt');
  writeFileSync(keyPath, pems.private, {mode: 0o600});
  writeFileSync(certPath, pems.cert, {mode: 0o644});
  writeFileSync(caCertPath, pems.cert, {mode: 0o644});

  const container = await new RedisContainer('redis:7-alpine')
    .withCopyContentToContainer([
      {content: Buffer.from(pems.private), target: '/tls/server.key'},
      {content: Buffer.from(pems.cert), target: '/tls/server.crt'},
    ])
    .withCommand([
      'redis-server',
      '--tls-port',
      '6380',
      '--port',
      '0',
      '--tls-cert-file',
      '/tls/server.crt',
      '--tls-key-file',
      '/tls/server.key',
      '--tls-ca-cert-file',
      '/tls/server.crt',
      '--tls-auth-clients',
      'no',
      '--requirepass',
      password,
    ])
    .withExposedPorts(6380)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(6380);
  const connectionUrl = `rediss://${host}:${port}`;

  return {
    container,
    connectionUrl,
    caCertPath,
    password,
    stop: async (): Promise<void> => {
      certDir.removeCallback();
      await container.stop();
    },
  };
}

function useRedisContainerFrom(
  starter: () => Promise<StartedRedisTestContainer>
): {client: () => RedisClient; connectionUrl: () => string} {
  let _client: RedisClient;
  let _stop: () => Promise<void>;
  let _connectionUrl: string;

  beforeAll(async () => {
    const started = await starter();
    _stop = started.stop;
    _connectionUrl = started.connectionUrl;
    _client = new Redis(_connectionUrl, {maxRetriesPerRequest: null});
  });

  afterAll(async () => {
    await _client.quit();
    await _stop();
  });

  beforeEach(async () => {
    await _client.flushall();
  });

  return {client: () => _client, connectionUrl: () => _connectionUrl};
}

export function useRedisContainer(): {
  client: () => RedisClient;
  connectionUrl: () => string;
} {
  return useRedisContainerFrom(startRedisContainer);
}

export function useRedisContainerWithAuth(): {
  client: () => RedisClient;
  connectionUrl: () => string;
} {
  let _client: RedisClient;
  let _stop: () => Promise<void>;
  let _connectionUrl: string;

  beforeAll(async () => {
    const started = await startRedisContainerWithAuth();
    _stop = started.stop;
    _connectionUrl = started.connectionUrl;
    _client = new Redis(_connectionUrl, {
      password: started.password,
      maxRetriesPerRequest: null,
    });
  });

  afterAll(async () => {
    await _client.quit();
    await _stop();
  });

  beforeEach(async () => {
    await _client.flushall();
  });

  return {client: () => _client, connectionUrl: () => _connectionUrl};
}

export function useRedisContainerTls(): {
  client: () => RedisClient;
  connectionUrl: () => string;
} {
  let _client: RedisClient;
  let _stop: () => Promise<void>;
  let _connectionUrl: string;

  beforeAll(async () => {
    const started = await startRedisContainerTls();
    _stop = started.stop;
    _connectionUrl = started.connectionUrl;
    _client = new Redis(_connectionUrl, {
      password: started.password,
      tls: {ca: readFileSync(started.caCertPath)},
      maxRetriesPerRequest: null,
    });
  });

  afterAll(async () => {
    await _client.quit();
    await _stop();
  });

  beforeEach(async () => {
    await _client.flushall();
  });

  return {client: () => _client, connectionUrl: () => _connectionUrl};
}
