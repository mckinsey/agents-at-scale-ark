import type {Logger} from '@ark-broker/logging/logger.js';
import type {EventData, EventStream} from '../event-broker.js';
import {InMemoryQueryDeletableStream} from './in-memory-query-deletable-stream.js';

export class InMemoryEventStream
  extends InMemoryQueryDeletableStream<EventData>
  implements EventStream
{
  constructor(logger: Logger, name: string, path?: string, maxItems?: number) {
    super(logger, name, (data) => data.data.queryId, path, maxItems);
  }
}
