import type {BrokerItem} from './stream/broker-item.js';
import type {ChunkStream, CompletionChunkData} from './stream/chunk-stream.js';
import type {PaginatedList, PaginationParams} from './pagination.js';

export type {CompletionChunkData} from './stream/chunk-stream.js';

export class CompletionChunkBroker {
  constructor(private readonly stream: ChunkStream) {}

  addChunk(
    queryId: string,
    chunk: unknown
  ): Promise<BrokerItem<CompletionChunkData>> {
    return this.stream.appendChunk(queryId, chunk);
  }

  completeQuery(queryId: string): Promise<BrokerItem<CompletionChunkData>> {
    return this.stream.completeQuery(queryId);
  }

  getByQuery(queryId: string): Promise<BrokerItem<CompletionChunkData>[]> {
    return this.stream.getByQuery(queryId);
  }

  isComplete(queryId: string): Promise<boolean> {
    return this.stream.isComplete(queryId);
  }

  hasQuery(queryId: string): Promise<boolean> {
    return this.stream.hasQuery(queryId);
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
    return this.stream.subscribeAll(callback);
  }

  all(): Promise<BrokerItem<CompletionChunkData>[]> {
    return this.stream.all();
  }

  save(): Promise<void> {
    return this.stream.save();
  }

  delete(): Promise<void> {
    return this.stream.delete();
  }

  paginate(
    params: PaginationParams,
    queryId?: string
  ): Promise<PaginatedList<BrokerItem<CompletionChunkData>>> {
    return this.stream.paginate(params, queryId);
  }

  getCurrentSequence(): Promise<number> {
    return this.stream.getCurrentSequence();
  }
}
