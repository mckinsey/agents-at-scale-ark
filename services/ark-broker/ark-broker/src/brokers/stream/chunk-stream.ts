import type {BrokerItem} from './broker-item.js';
import type {
  PaginatedList,
  PaginationParams,
} from '@ark-broker/brokers/pagination.js';

export interface CompletionChunkData {
  queryId: string;
  chunk: unknown;
  complete?: boolean;
}

export interface ChunkStream {
  appendChunk(
    queryId: string,
    chunk: unknown
  ): Promise<BrokerItem<CompletionChunkData>>;
  completeQuery(queryId: string): Promise<BrokerItem<CompletionChunkData>>;
  getByQuery(queryId: string): Promise<BrokerItem<CompletionChunkData>[]>;
  isComplete(queryId: string): Promise<boolean>;
  hasQuery(queryId: string): Promise<boolean>;
  subscribeToQuery(
    queryId: string,
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void;
  subscribeAll(
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void;
  all(): Promise<BrokerItem<CompletionChunkData>[]>;
  paginate(
    params: PaginationParams,
    queryId?: string
  ): Promise<PaginatedList<BrokerItem<CompletionChunkData>>>;
  getCurrentSequence(): Promise<number>;
  delete(queryId?: string): Promise<void>;
  save(): Promise<void>;
}
