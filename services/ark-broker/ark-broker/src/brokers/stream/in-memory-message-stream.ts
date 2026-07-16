import type {Logger} from '@ark-broker/logging/logger.js';
import type {MessageData} from '../memory-broker.js';
import {InMemoryQueryDeletableStream} from './in-memory-query-deletable-stream.js';
import type {MessageStream} from './message-stream.js';

export class InMemoryMessageStream
  extends InMemoryQueryDeletableStream<MessageData>
  implements MessageStream
{
  constructor(logger: Logger, name: string, path?: string, maxItems?: number) {
    super(logger, name, (data) => data.queryId, path, maxItems);
  }
}
