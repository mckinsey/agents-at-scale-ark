import {EventEmitter} from 'node:events';
import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import {BrokerItem} from './broker-item.js';
import {
  DEFAULT_LIMIT,
  type PaginatedList,
  type PaginationParams,
} from '../pagination.js';
import type {Predicate, Stream} from './stream.js';

export abstract class PostgresStreamBase<T> implements Stream<T> {
  protected readonly emitter = new EventEmitter();

  protected constructor(
    protected readonly logger: Logger,
    protected readonly db: Db,
    protected readonly ttlSeconds: number
  ) {}

  protected abstract readonly tableName: string;
  protected abstract readonly selectColumns: string[];
  protected abstract rowToItem(row: postgres.Row): BrokerItem<T>;

  abstract append(data: T, ttlSeconds?: number): Promise<BrokerItem<T>>;
  abstract delete(predicate?: Predicate<T>): Promise<void>;
  abstract getCurrentSequence(): Promise<number>;

  async all(): Promise<BrokerItem<T>[]> {
    const rows = await this.db`
      SELECT ${this.db(this.selectColumns)}
      FROM ${this.db(this.tableName)}
      WHERE expires_at > now()
      ORDER BY sequence_number ASC
    `;
    return rows.map((row) => this.rowToItem(row));
  }

  async filter(predicate: Predicate<T>): Promise<BrokerItem<T>[]> {
    return (await this.all()).filter(predicate);
  }

  async paginate(
    params: PaginationParams,
    predicate?: Predicate<T>
  ): Promise<PaginatedList<BrokerItem<T>>> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const cursor = params.cursor;

    const all = await this.all();
    let filtered = predicate ? all.filter(predicate) : all;
    const total = filtered.length;

    if (cursor !== undefined) {
      filtered = filtered.filter((item) => item.sequenceNumber > cursor);
    }

    const items = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const lastItem = items.at(-1);

    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore && lastItem ? lastItem.sequenceNumber : undefined,
    };
  }

  async save(): Promise<void> {
    // no-op: Postgres persists synchronously on append, no separate flush step
  }

  subscribe(callback: (item: BrokerItem<T>) => void): () => void {
    this.emitter.on('item', callback);
    return (): void => {
      this.emitter.off('item', callback);
    };
  }
}
