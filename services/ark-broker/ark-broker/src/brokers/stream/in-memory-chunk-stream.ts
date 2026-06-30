import type {Logger} from '@ark-broker/logging/logger.js';
import type {
  PaginatedList,
  PaginationParams,
} from '@ark-broker/brokers/pagination.js';
import {InMemoryStream} from './in-memory-stream.js';
import type {BrokerItem} from './broker-item.js';
import type {ChunkStream, CompletionChunkData} from './chunk-stream.js';

export class InMemoryChunkStream implements ChunkStream {
  private readonly stream: InMemoryStream<CompletionChunkData>;

  constructor(logger: Logger, path?: string, maxItems?: number) {
    this.stream = new InMemoryStream<CompletionChunkData>(
      logger,
      'CompletionChunk',
      path,
      maxItems
    );
  }

  appendChunk(
    queryId: string,
    chunk: unknown
  ): Promise<BrokerItem<CompletionChunkData>> {
    return this.stream.append({queryId, chunk});
  }

  async completeQuery(
    queryId: string
  ): Promise<BrokerItem<CompletionChunkData>> {
    const item = await this.stream.append({
      queryId,
      chunk: '[DONE]',
      complete: true,
    });
    await this.stream.save();
    return item;
  }

  async getByQuery(
    queryId: string
  ): Promise<BrokerItem<CompletionChunkData>[]> {
    return this.stream.filter((item) => item.data.queryId === queryId);
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

  subscribeToQuery(
    queryId: string,
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    return this.stream.subscribe((item) => {
      if (item.data.queryId === queryId) callback(item);
    });
  }

  subscribeAll(
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    return this.stream.subscribe(callback);
  }

  all(): Promise<BrokerItem<CompletionChunkData>[]> {
    return this.stream.all();
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

  async delete(queryId?: string): Promise<void> {
    if (queryId) {
      return this.stream.delete((item) => item.data.queryId === queryId);
    }
    return this.stream.delete();
  }

  save(): Promise<void> {
    return this.stream.save();
  }
}
