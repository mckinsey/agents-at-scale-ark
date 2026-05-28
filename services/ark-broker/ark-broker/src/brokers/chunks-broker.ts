import {EventEmitter} from 'events';
import {BrokerItem} from './stream/broker-item.js';
import {BrokerItemStream} from './stream/broker-item-stream.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import {PaginatedList, PaginationParams} from './pagination.js';

/** Data payload for OpenAI chat completion streaming chunks */
export interface CompletionChunkData {
  queryId: string;
  chunk: unknown;
  complete?: boolean;
}

/**
 * Broker for storing OpenAI chat completion streaming chunks.
 * Chunks are grouped by query ID and track completion status.
 */
export class CompletionChunkBroker {
  private stream: BrokerItemStream<CompletionChunkData>;
  public eventEmitter = new EventEmitter();

  constructor(logger: Logger, path?: string, maxItems?: number) {
    this.stream = new BrokerItemStream<CompletionChunkData>(
      logger,
      'CompletionChunk',
      path,
      maxItems
    );
  }

  addChunk(queryId: string, chunk: unknown): BrokerItem<CompletionChunkData> {
    const item = this.stream.append({queryId, chunk});
    this.eventEmitter.emit(`chunk:${queryId}`, chunk);
    return item;
  }

  completeQuery(queryId: string): BrokerItem<CompletionChunkData> {
    const item = this.stream.append({queryId, chunk: '[DONE]', complete: true});
    this.eventEmitter.emit(`complete:${queryId}`);
    this.save();
    return item;
  }

  getByQuery(queryId: string): BrokerItem<CompletionChunkData>[] {
    return this.stream.filter((item) => item.data.queryId === queryId);
  }

  getChunksByQuery(queryId: string): unknown[] {
    return this.getByQuery(queryId).map((item) => item.data.chunk);
  }

  isComplete(queryId: string): boolean {
    return this.stream
      .all()
      .some(
        (item) => item.data.queryId === queryId && item.data.complete === true
      );
  }

  hasQuery(queryId: string): boolean {
    return this.stream.all().some((item) => item.data.queryId === queryId);
  }

  all(): BrokerItem<CompletionChunkData>[] {
    return this.stream.all();
  }

  save(): void {
    this.stream.save();
  }

  delete(): void {
    this.stream.delete();
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

  paginate(
    params: PaginationParams,
    queryId?: string
  ): PaginatedList<BrokerItem<CompletionChunkData>> {
    const predicate = queryId
      ? (item: BrokerItem<CompletionChunkData>): boolean =>
          item.data.queryId === queryId
      : undefined;
    return this.stream.paginate(params, predicate);
  }

  getCurrentSequence(): number {
    return this.stream.getCurrentSequence();
  }
}
