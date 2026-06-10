import type {AppConfig} from '@ark-broker/config/index.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {MessageData} from '../memory-broker.js';
import type {Stream} from './stream.js';
import {InMemoryStream} from './in-memory-stream.js';

export function createMessageStream(
  config: AppConfig,
  logger: Logger
): Stream<MessageData> {
  return new InMemoryStream<MessageData>(
    logger.child({broker: 'memory'}),
    'Memory',
    config.persistence.memoryFilePath,
    config.limits.maxMessages
  );
}
