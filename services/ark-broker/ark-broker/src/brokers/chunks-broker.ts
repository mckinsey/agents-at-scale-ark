import type {BrokerItem} from './stream/broker-item.js';
import type {ChunkStream, CompletionChunkData} from './stream/chunk-stream.js';
import {
  DEFAULT_LIMIT,
  type PaginatedList,
  type PaginationParams,
} from './pagination.js';

export type {CompletionChunkData} from './stream/chunk-stream.js';

export class CompletionChunkBroker {
  constructor(private readonly stream: ChunkStream) {}

  startRun(queryId: string, runId: string): Promise<void> {
    return this.stream.startRun(queryId, runId);
  }

  addChunk(
    queryId: string,
    chunk: unknown,
    runId?: string
  ): Promise<BrokerItem<CompletionChunkData>> {
    return this.stream.appendChunk(queryId, chunk, runId);
  }

  completeQuery(
    queryId: string,
    runId?: string
  ): Promise<BrokerItem<CompletionChunkData>> {
    return this.stream.completeQuery(queryId, runId);
  }

  getByQuery(queryId: string): Promise<BrokerItem<CompletionChunkData>[]> {
    return this.stream.getByQuery(queryId);
  }

  isComplete(queryId: string, runId?: string): Promise<boolean> {
    return this.stream.isComplete(queryId, runId);
  }

  subscribeToQuery(
    queryId: string,
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    return this.stream.subscribeToQuery(queryId, callback);
  }

  subscribe(
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    return this.stream.subscribeAll((item) => {
      if (!item.data.runStart) callback(item);
    });
  }

  async all(): Promise<BrokerItem<CompletionChunkData>[]> {
    return (await this.stream.all()).filter((item) => !item.data.runStart);
  }

  save(): Promise<void> {
    return this.stream.save();
  }

  paginate(
    params: PaginationParams,
    queryId?: string
  ): Promise<PaginatedList<BrokerItem<CompletionChunkData>>> {
    return this.paginateVisibleItems(params, queryId);
  }

  private async paginateVisibleItems(
    params: PaginationParams,
    queryId?: string
  ): Promise<PaginatedList<BrokerItem<CompletionChunkData>>> {
    const storedItems = queryId
      ? await this.stream.getByQuery(queryId)
      : await this.stream.all();
    const visibleItems = storedItems.filter((item) => !item.data.runStart);
    const total = visibleItems.length;
    const filtered =
      params.cursor === undefined
        ? visibleItems
        : visibleItems.filter((item) => item.sequenceNumber > params.cursor!);
    const limit = params.limit ?? DEFAULT_LIMIT;
    const items = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;

    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore ? items.at(-1)?.sequenceNumber : undefined,
    };
  }

  getCurrentSequence(): Promise<number> {
    return this.stream.getCurrentSequence();
  }
}
