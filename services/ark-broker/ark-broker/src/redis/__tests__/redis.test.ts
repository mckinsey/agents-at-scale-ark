import {createLogger} from '@ark-broker/logging/logger';
import {loadConfig} from '@ark-broker/config/index';
import {createRedis, pingRedis} from '../redis';
import {
  startRedisContainer,
  startRedisContainerTls,
  startRedisContainerWithAuth,
} from './testHelpers/redis-testcontainer';

const logger = createLogger({level: 'silent', pretty: false});

describe('createRedis / pingRedis — plain', () => {
  let stop: () => Promise<void>;
  let connectionUrl: string;

  beforeAll(async () => {
    const started = await startRedisContainer();
    stop = started.stop;
    connectionUrl = started.connectionUrl;
  });

  afterAll(async () => {
    await stop();
  });

  it('connects and pings successfully', async () => {
    const config = loadConfig({
      CHUNK_BACKEND: 'redis',
      REDIS_URL: connectionUrl,
    });
    const client = createRedis(config, logger);
    try {
      await expect(pingRedis(client)).resolves.toBeUndefined();
    } finally {
      await client.quit();
    }
  });
});

describe('createRedis — with auth', () => {
  let stop: () => Promise<void>;
  let connectionUrl: string;
  let password: string;

  beforeAll(async () => {
    const started = await startRedisContainerWithAuth();
    stop = started.stop;
    connectionUrl = started.connectionUrl;
    password = started.password;
  });

  afterAll(async () => {
    await stop();
  });

  it('connects with password', async () => {
    const config = loadConfig({
      CHUNK_BACKEND: 'redis',
      REDIS_URL: connectionUrl,
      REDIS_PASSWORD: password,
    });
    const client = createRedis(config, logger);
    try {
      await expect(pingRedis(client)).resolves.toBeUndefined();
    } finally {
      await client.quit();
    }
  });
});

describe('createRedis — TLS with self-signed cert', () => {
  let stop: () => Promise<void>;
  let connectionUrl: string;
  let caCertPath: string;
  let password: string;

  beforeAll(async () => {
    const started = await startRedisContainerTls();
    stop = started.stop;
    connectionUrl = started.connectionUrl;
    caCertPath = started.caCertPath;
    password = started.password;
  });

  afterAll(async () => {
    await stop();
  });

  it('connects over TLS with CA cert and password', async () => {
    const config = loadConfig({
      CHUNK_BACKEND: 'redis',
      REDIS_URL: connectionUrl,
      REDIS_TLS_CA_CERT_PATH: caCertPath,
      REDIS_PASSWORD: password,
    });
    const client = createRedis(config, logger);
    try {
      await expect(pingRedis(client)).resolves.toBeUndefined();
    } finally {
      await client.quit();
    }
  });
});
