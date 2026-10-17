import type {Logger} from '@ark-broker/logging/logger.js';
import type {
  PaginatedList,
  PaginationParams,
} from '@ark-broker/brokers/pagination.js';
import {InMemoryStream, InMemoryStreamOptions} from './in-memory-stream.js';
import type {BrokerItem} from './broker-item.js';
import type {ChunkStream, CompletionChunkData} from './chunk-stream.js';

export class InMemoryChunkStream implements ChunkStream {
  private readonly stream: InMemoryStream<CompletionChunkData>;

  constructor(logger: Logger, opts?: InMemoryStreamOptions) {
    this.stream = new InMemoryStream<CompletionChunkData>(
      logger,
      'CompletionChunk',
      opts
    );
  }

  async init(): Promise<void> {
    await this.stream.init();
  }

  close(): void {
    this.stream.close();
  }

  async startRun(queryId: string, runId: string): Promise<void> {
    const items = await this.stream.filter(
      (item) =>
        item.data.queryId === queryId &&
        item.data.runId === runId &&
        item.data.runStart === true
    );
    if (items.length > 0) return;

    await this.stream.append({queryId, chunk: null, runId, runStart: true});
    await this.stream.save();
  }

  appendChunk(
    queryId: string,
    chunk: unknown,
    runId?: string
  ): Promise<BrokerItem<CompletionChunkData>> {
    return this.stream.append({queryId, chunk, ...(runId ? {runId} : {})});
  }

  async completeQuery(
    queryId: string,
    runId?: string
  ): Promise<BrokerItem<CompletionChunkData>> {
    if (runId) await this.startRun(queryId, runId);
    const item = await this.stream.append({
      queryId,
      chunk: '[DONE]',
      complete: true,
      ...(runId ? {runId} : {}),
    });
    await this.stream.save();
    return item;
  }

  async getByQuery(
    queryId: string
  ): Promise<BrokerItem<CompletionChunkData>[]> {
    return this.stream.filter((item) => item.data.queryId === queryId);
  }

  async isComplete(queryId: string, runId?: string): Promise<boolean> {
    const items = await this.getByQuery(queryId);
    if (runId !== undefined) {
      return (
        items.filter((item) => item.data.runId === runId).at(-1)?.data
          .complete === true
      );
    }

    const latestRunId = [...items]
      .reverse()
      .find((item) => item.data.runStart === true)?.data.runId;
    const latestRun =
      latestRunId === undefined
        ? items
        : items.filter((item) => item.data.runId === latestRunId);
    return latestRun.at(-1)?.data.complete === true;
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

  cachedItemCount(): number {
    return this.stream.cachedItemCount();
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
