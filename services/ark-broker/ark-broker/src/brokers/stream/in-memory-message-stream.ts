import type {Logger} from '@ark-broker/logging/logger.js';
import type {MessageData} from '../memory-broker.js';
import {InMemoryStream} from './in-memory-stream.js';
import type {MessageStream} from './message-stream.js';

export class InMemoryMessageStream
  extends InMemoryStream<MessageData>
  implements MessageStream
{
  constructor(logger: Logger, name: string, path?: string, maxItems?: number) {
    super(logger, name, path, maxItems);
  }

  async deleteByQuery(queryId: string): Promise<void> {
    await this.delete((item) => item.data.queryId === queryId);
  }
}
