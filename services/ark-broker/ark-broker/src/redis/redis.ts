import {readFileSync} from 'fs';
import Redis from 'ioredis';
import type {AppConfig} from '@ark-broker/config/index.js';
import type {Logger} from '@ark-broker/logging/logger.js';

export type RedisClient = Redis;

export function createRedis(config: AppConfig, logger: Logger): RedisClient {
  const log = logger.child({module: 'redis'});
  const {redis} = config;

  const tls =
    redis.url?.startsWith('rediss://') && redis.tlsCaCertPath
      ? {ca: readFileSync(redis.tlsCaCertPath)}
      : redis.url?.startsWith('rediss://')
        ? {}
        : undefined;

  const client = new Redis(redis.url!, {
    username: redis.username,
    password: redis.password,
    connectTimeout: redis.connectTimeoutMs,
    maxRetriesPerRequest: null,
    ...(tls !== undefined ? {tls} : {}),
  });

  client.on('connect', () => {
    if (redis.debugCommands) log.info('redis connected');
  });
  client.on('ready', () => {
    if (redis.debugCommands) log.info('redis ready');
  });
  client.on('reconnecting', () => {
    if (redis.debugCommands) log.info('redis reconnecting');
  });
  client.on('error', (err: Error) => {
    log.error({err}, 'redis error');
  });

  return client;
}

export async function pingRedis(client: RedisClient): Promise<void> {
  await client.ping();
}
