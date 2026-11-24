import type {Logger} from '@ark-broker/logging/logger.js';
import {InMemoryStream, InMemoryStreamOptions} from './in-memory-stream.js';

export abstract class InMemoryQueryDeletableStream<
  T,
> extends InMemoryStream<T> {
  constructor(
    logger: Logger,
    name: string,
    private readonly queryIdOf: (data: T) => string,
    opts?: InMemoryStreamOptions
  ) {
    super(logger, name, opts);
  }

  async deleteByQuery(queryId: string): Promise<void> {
    await this.delete((item) => this.queryIdOf(item.data) === queryId);
  }
}
