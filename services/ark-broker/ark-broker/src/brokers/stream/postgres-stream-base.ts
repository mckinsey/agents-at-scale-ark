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
import {hasScopingField, type Predicate, type Stream} from './stream.js';

export abstract class PostgresStreamBase<
  T,
  F extends {afterSequence?: number},
> implements Stream<T> {
  protected readonly emitter = new EventEmitter();

  protected constructor(
    protected readonly logger: Logger,
    protected readonly db: Db,
    protected readonly ttlSeconds: number
  ) {}

  protected abstract readonly tableName: string;
  protected abstract readonly selectColumns: string[];
  protected abstract rowToItem(row: postgres.Row): BrokerItem<T>;
  protected abstract whereFor(filter: F): postgres.Fragment;

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

  async filterBy(filter: F): Promise<BrokerItem<T>[]> {
    const afterSequence = filter.afterSequence;
    const rows = await this.db`
      SELECT ${this.db(this.selectColumns)}
      FROM ${this.db(this.tableName)}
      WHERE expires_at > now()
      ${this.whereFor(filter)}
      ${afterSequence === undefined ? this.db`` : this.db`AND sequence_number > ${afterSequence}`}
      ORDER BY sequence_number ASC
    `;
    return rows.map((row) => this.rowToItem(row));
  }

  async paginateBy(
    params: PaginationParams,
    filter?: F
  ): Promise<PaginatedList<BrokerItem<T>>> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const cursor = params.cursor;

    const rows = await this.db`
      SELECT ${this.db(this.selectColumns)}
      FROM ${this.db(this.tableName)}
      WHERE expires_at > now()
      ${filter ? this.whereFor(filter) : this.db``}
      ${cursor === undefined ? this.db`` : this.db`AND sequence_number > ${cursor}`}
      ORDER BY sequence_number ASC
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => this.rowToItem(row));
    const lastItem = items.at(-1);

    return {
      items,
      // total is intentionally left unpopulated here: no COUNT(*).
      hasMore,
      nextCursor: hasMore && lastItem ? lastItem.sequenceNumber : undefined,
    };
  }

  async deleteBy(filter: F): Promise<void> {
    if (!hasScopingField(filter as Record<string, unknown>)) {
      throw new Error('deleteBy requires at least one filter field');
    }
    this.logger.info({filter}, 'deleting by filter');
    await this.db`
      DELETE FROM ${this.db(this.tableName)}
      WHERE true
      ${this.whereFor(filter)}
    `;
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
