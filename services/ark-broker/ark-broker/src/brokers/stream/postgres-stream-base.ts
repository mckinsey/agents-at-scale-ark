import {randomUUID} from 'node:crypto';
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

const LISTEN_RETRY_INITIAL_MS = 500;
const LISTEN_RETRY_MAX_MS = 30_000;

export abstract class PostgresStreamBase<
  T,
  F extends {afterSequence?: number},
> implements Stream<T> {
  protected readonly emitter = new EventEmitter();
  private readonly instanceId = randomUUID();
  private listenSubscription?: Awaited<ReturnType<Db['listen']>>;
  private listening?: Promise<void>;
  private closed = false;

  protected constructor(
    protected readonly logger: Logger,
    protected readonly db: Db,
    protected readonly ttlSeconds: number
  ) {}

  protected abstract readonly tableName: string;
  protected abstract readonly selectColumns: string[];
  protected abstract readonly notifyChannel: string;
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

  async init(): Promise<void> {
    if (this.listening) return;
    this.listening = this.startListening();
  }

  /** Tests await this so subscribe assertions don't race the LISTEN handshake. */
  async whenListening(): Promise<void> {
    await this.listening;
  }

  close(): void {
    this.closed = true;
    void this.listenSubscription?.unlisten().catch((err) => {
      this.logger.warn({err}, 'failed to unlisten cross-replica channel');
    });
  }

  /**
   * Retries forever with backoff, mirroring PostgresSessionsStorage: postgres.js
   * re-registers a channel when an established listen connection drops, but if
   * the very first attempt fails - a replica booting during a failover, say -
   * there is nothing registered to re-register, and that pod serves reads
   * normally while never delivering a live update again. init() fires this
   * without awaiting it so a slow/failing first attempt can't block or crash
   * server startup (index.ts awaits init() before accepting traffic).
   */
  private async startListening(): Promise<void> {
    let delayMs = LISTEN_RETRY_INITIAL_MS;
    while (!this.closed) {
      try {
        const subscription = await this.db.listen(
          this.notifyChannel,
          (payload) => {
            void this.onNotify(payload).catch((err) => {
              this.logger.error(
                {err},
                'failed to process cross-replica notification'
              );
            });
          }
        );
        // close() may have run while db.listen() above was still in flight -
        // it only checked `closed` before this attempt started, so without
        // this a subscription established after close() would be left
        // dangling (never unlisten()'d) and would keep emitting.
        if (this.closed) {
          void subscription.unlisten().catch((err) => {
            this.logger.warn(
              {err},
              'failed to unlisten cross-replica channel after close'
            );
          });
          return;
        }
        this.listenSubscription = subscription;
        return;
      } catch (err) {
        this.logger.error(
          {err, retryInMs: delayMs},
          'failed to listen for cross-replica notifications, retrying'
        );
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs).unref();
        });
        delayMs = Math.min(delayMs * 2, LISTEN_RETRY_MAX_MS);
      }
    }
  }

  /**
   * Handles a NOTIFY from any replica (including this one - Postgres delivers
   * a sending session its own notifications too). Payloads from this instance
   * are skipped since that item was already emitted locally at append() time;
   * every other payload is resolved to a single row by exact sequence number
   * (never a range) so a batch from one replica can't incidentally re-emit a
   * row another replica already delivered itself.
   */
  private async onNotify(payload: string): Promise<void> {
    let parsed: {instanceId?: string; sequenceNumber?: number};
    try {
      parsed = JSON.parse(payload) as {
        instanceId?: string;
        sequenceNumber?: number;
      };
    } catch (err) {
      this.logger.warn({err}, 'received malformed cross-replica notification');
      return;
    }
    if (
      parsed.instanceId === this.instanceId ||
      typeof parsed.sequenceNumber !== 'number'
    ) {
      return;
    }
    const rows = await this.db`
      SELECT ${this.db(this.selectColumns)}
      FROM ${this.db(this.tableName)}
      WHERE sequence_number = ${parsed.sequenceNumber} AND expires_at > now()
    `;
    const row = rows[0];
    if (!row) return;
    this.emitter.emit('item', this.rowToItem(row));
  }

  /**
   * Publishing the NOTIFY never fails append()/appendMany() - errors are
   * caught and logged here, not thrown - but it is awaited by the caller so
   * the write path has a deterministic point where the notification has been
   * dispatched. One pg_notify per sequence number (via unnest), sent as a
   * single round-trip regardless of batch size. `instanceId` needs an
   * explicit ::text cast: json_build_object's arguments are polymorphic, so
   * Postgres can't infer a type for a bare parameter passed to it.
   */
  protected async notifyAppended(sequenceNumbers: number[]): Promise<void> {
    if (sequenceNumbers.length === 0) return;
    try {
      await this.db`
        SELECT pg_notify(
          ${this.notifyChannel},
          json_build_object('instanceId', ${this.instanceId}::text, 'sequenceNumber', seq)::text
        )
        FROM unnest(${sequenceNumbers}::bigint[]) AS seq
      `;
    } catch (err) {
      this.logger.warn(
        {err, sequenceNumbers},
        'failed to publish cross-replica notification'
      );
    }
  }
}
