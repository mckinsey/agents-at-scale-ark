import {EventEmitter} from 'events';
import {BrokerItem} from './stream/broker-item.js';
import {InMemoryStream} from './stream/in-memory-stream.js';
import type {Stream} from './stream/stream.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import {PaginatedList, PaginationParams} from './pagination.js';

export interface CompletionChunkData {
  queryId: string;
  chunk: unknown;
  complete?: boolean;
}

export class CompletionChunkBroker {
  private readonly stream: Stream<CompletionChunkData>;
  public eventEmitter = new EventEmitter();

  constructor(logger: Logger, path?: string, maxItems?: number) {
    this.stream = new InMemoryStream<CompletionChunkData>(
      logger,
      'CompletionChunk',
      path,
      maxItems
    );
  }

  async addChunk(
    queryId: string,
    chunk: unknown
  ): Promise<BrokerItem<CompletionChunkData>> {
    const item = await this.stream.append({queryId, chunk});
    this.eventEmitter.emit(`chunk:${queryId}`, chunk);
    return item;
  }

  async completeQuery(
    queryId: string
  ): Promise<BrokerItem<CompletionChunkData>> {
    const item = await this.stream.append({
      queryId,
      chunk: '[DONE]',
      complete: true,
    });
    this.eventEmitter.emit(`complete:${queryId}`);
    await this.save();
    return item;
  }

  async getByQuery(
    queryId: string
  ): Promise<BrokerItem<CompletionChunkData>[]> {
    return this.stream.filter((item) => item.data.queryId === queryId);
  }

  async getChunksByQuery(queryId: string): Promise<unknown[]> {
    return (await this.getByQuery(queryId)).map((item) => item.data.chunk);
  }

  async isComplete(queryId: string): Promise<boolean> {
    return (await this.stream.all()).some(
      (item) => item.data.queryId === queryId && item.data.complete === true
    );
  }

  async hasQuery(queryId: string): Promise<boolean> {
    return (await this.stream.all()).some(
      (item) => item.data.queryId === queryId
    );
  }

  all(): Promise<BrokerItem<CompletionChunkData>[]> {
    return this.stream.all();
  }

  save(): Promise<void> {
    return this.stream.save();
  }

  async delete(): Promise<void> {
    return this.stream.delete();
  }

  subscribe(
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    return this.stream.subscribe(callback);
  }

  subscribeToQuery(
    queryId: string,
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    return this.stream.subscribe((item) => {
      if (item.data.queryId === queryId) {
        callback(item);
      }
    });
  }

  async paginate(
    params: PaginationParams,
    queryId?: string
  ): Promise<PaginatedList<BrokerItem<CompletionChunkData>>> {
    const predicate = queryId
      ? (item: BrokerItem<CompletionChunkData>): boolean =>
          item.data.queryId === queryId
      : undefined;
    return this.stream.paginate(params, predicate);
  }

  async getCurrentSequence(): Promise<number> {
    return this.stream.getCurrentSequence();
  }
}
