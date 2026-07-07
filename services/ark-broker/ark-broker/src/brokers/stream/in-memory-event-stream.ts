import type {Logger} from '@ark-broker/logging/logger.js';
import type {EventData, EventStream} from '../event-broker.js';
import {InMemoryStream} from './in-memory-stream.js';

export class InMemoryEventStream
  extends InMemoryStream<EventData>
  implements EventStream
{
  constructor(logger: Logger, name: string, path?: string, maxItems?: number) {
    super(logger, name, path, maxItems);
  }

  async deleteByQuery(queryId: string): Promise<void> {
    await this.delete((item) => item.data.data.queryId === queryId);
  }
}
