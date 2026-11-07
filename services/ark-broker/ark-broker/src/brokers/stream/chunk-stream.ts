import type {BrokerItem} from './broker-item.js';
import type {
  PaginatedList,
  PaginationParams,
} from '@ark-broker/brokers/pagination.js';

export interface CompletionChunkData {
  queryId: string;
  chunk: unknown;
  complete?: boolean;
  runId?: string;
  runStart?: boolean;
}

export interface ChunkStream {
  init?(): Promise<void>;
  close?(): void;
  startRun(queryId: string, runId: string): Promise<void>;
  appendChunk(
    queryId: string,
    chunk: unknown,
    runId?: string
  ): Promise<BrokerItem<CompletionChunkData>>;
  completeQuery(
    queryId: string,
    runId?: string
  ): Promise<BrokerItem<CompletionChunkData>>;
  getByQuery(queryId: string): Promise<BrokerItem<CompletionChunkData>[]>;
  isComplete(queryId: string, runId?: string): Promise<boolean>;
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
  cachedItemCount?(): number;
}
