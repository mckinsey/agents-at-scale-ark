import type {AppConfig} from '@ark-broker/config/index.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import type Redis from 'ioredis';
import {InMemoryChunkStream} from './in-memory-chunk-stream.js';
import {RedisChunkStream} from './redis-chunk-stream.js';
import type {ChunkStream} from './chunk-stream.js';

export function createChunkStream(
  config: AppConfig,
  logger: Logger,
  redis?: Redis
): ChunkStream {
  if (config.backends.chunk === 'redis') {
    return new RedisChunkStream(
      redis!,
      logger.child({broker: 'redis-chunks'}),
      config.redis.keyPrefix,
      config.redis.streamTtlSeconds
    );
  }
  return new InMemoryChunkStream(
    logger.child({broker: 'chunks'}),
    config.persistence.streamFilePath,
    config.limits.maxChunks
  );
}
