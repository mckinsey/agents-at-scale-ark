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

// Catch-up on (re)connect re-scans this many rows behind the high-water mark
// rather than trusting it as a hard cutoff. BIGSERIAL assigns sequence
// numbers before commit, so under concurrent writers a lower number can
// commit slightly after a higher one already advanced the mark - the
// lookback tolerates that race. markSeen's dedup makes re-scanning safe.
const CATCHUP_LOOKBACK_ROWS = 200;

// Postgres caps a NOTIFY payload at 8000 bytes. A JSON array of this many
// sequence numbers stays comfortably under that even at their largest
// plausible width, so appendMany's first chunk always fits in the same
// statement as the insert; anything beyond it is sent as extra notifies
// afterward (see notifyOverflow) - only batches bigger than this pay for
// that, and appendMany's normal callers are far smaller.
export const NOTIFY_CHUNK_SIZE = 500;

export abstract class PostgresStreamBase<
  T,
  F extends {afterSequence?: number},
> implements Stream<T> {
  protected readonly emitter = new EventEmitter();
  private readonly instanceId = randomUUID();
  private listenSubscription?: Awaited<ReturnType<Db['listen']>>;
  private listening?: Promise<void>;
  private closed = false;
  private highWaterMark = 0;
  private readonly seenSequenceNumbers = new Set<number>();
  private catchingUp = false;
  private hasListenedBefore = false;

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
    this.listening = this.startListening().catch((err) => {
      // startListening()'s own loop never rejects today - every failure path
      // retries - but this.listening is a fire-and-forget field nothing else
      // awaits in production (only tests await it, via whenListening()), so
      // a future change that lets a rejection through would otherwise become
      // an unhandled rejection.
      this.logger.error({err}, 'cross-replica listener stopped unexpectedly');
    });
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
    if (this.highWaterMark === 0) {
      // Seed before the first successful listen so its own onlisten-driven
      // catch-up (below) starts from "now", not from the beginning of the
      // table - subscribe() should only ever reflect new writes, never a
      // replay of history at listen-setup time.
      this.highWaterMark = await this.getCurrentSequence().catch(() => 0);
    }
    let delayMs = LISTEN_RETRY_INITIAL_MS;
    let notifyQueue: Promise<void> = Promise.resolve();
    while (!this.closed) {
      try {
        const subscription = await this.db.listen(
          this.notifyChannel,
          (payload) => {
            // Chained rather than fired concurrently: two notifications
            // processed out of arrival order would each do their own async
            // row fetch and could emit out of order relative to each other.
            notifyQueue = notifyQueue.then(() =>
              this.onNotify(payload).catch((err) => {
                this.logger.error(
                  {err},
                  'failed to process cross-replica notification'
                );
              })
            );
          },
          () => {
            // Fires on the initial listen and again on every automatic
            // reconnect. A notification published while this instance was
            // disconnected is gone for good - Postgres does not queue NOTIFY
            // for an absent listener - so this is the only recovery path.
            // The initial listen gets no lookback: highWaterMark was just
            // seeded from a definitive snapshot, so anything at or below it
            // is history, not a gap, and re-scanning it would replay rows
            // that predate this instance ever listening.
            const isReconnect = this.hasListenedBefore;
            this.hasListenedBefore = true;
            void this.catchUp(isReconnect).catch((err) => {
              this.logger.error(
                {err},
                'failed to catch up on cross-replica notifications'
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
   * Records that sequenceNumber has now been emitted - locally at append()
   * time, live via onNotify, or via catchUp - and reports whether this is
   * the first time. All three paths gate their emit through this so none of
   * them can double-deliver a row either of the others already handled;
   * local call sites emit unconditionally and call this only to keep the
   * watermark/dedup state accurate for a later catch-up.
   */
  protected markSeen(sequenceNumber: number): boolean {
    if (this.seenSequenceNumbers.has(sequenceNumber)) return false;
    this.seenSequenceNumbers.add(sequenceNumber);
    if (sequenceNumber > this.highWaterMark) {
      this.highWaterMark = sequenceNumber;
      const floor = this.highWaterMark - CATCHUP_LOOKBACK_ROWS * 2;
      if (floor > 0) {
        for (const seen of this.seenSequenceNumbers) {
          if (seen < floor) this.seenSequenceNumbers.delete(seen);
        }
      }
    }
    return true;
  }

  private async catchUp(applyLookback: boolean): Promise<void> {
    if (this.catchingUp) return;
    this.catchingUp = true;
    try {
      const lookback = applyLookback ? CATCHUP_LOOKBACK_ROWS : 0;
      const from = Math.max(0, this.highWaterMark - lookback);
      const rows = await this.db`
        SELECT ${this.db(this.selectColumns)}
        FROM ${this.db(this.tableName)}
        WHERE sequence_number > ${from} AND expires_at > now()
        ORDER BY sequence_number ASC
      `;
      for (const row of rows) {
        const item = this.rowToItem(row);
        if (this.markSeen(item.sequenceNumber)) {
          this.emitter.emit('item', item);
        }
      }
    } finally {
      this.catchingUp = false;
    }
  }

  /**
   * Handles a NOTIFY from any replica (including this one - Postgres delivers
   * a sending session its own notifications too). Payloads from this instance
   * are skipped since those items were already emitted locally at append()
   * time; every other payload resolves to rows by exact sequence numbers
   * (never a range) via ANY(...), ordered, so a batch from one replica can't
   * incidentally re-emit a row another replica already delivered, and a
   * multi-row batch emits in the same order on every replica.
   */
  private async onNotify(payload: string): Promise<void> {
    let parsed: {instanceId?: string; sequenceNumbers?: unknown};
    try {
      parsed = JSON.parse(payload) as {
        instanceId?: string;
        sequenceNumbers?: unknown;
      };
    } catch (err) {
      this.logger.warn({err}, 'received malformed cross-replica notification');
      return;
    }
    if (parsed.instanceId === this.instanceId) return;
    const sequenceNumbers = parsed.sequenceNumbers;
    if (
      !Array.isArray(sequenceNumbers) ||
      sequenceNumbers.length === 0 ||
      sequenceNumbers.some((n) => typeof n !== 'number')
    ) {
      this.logger.warn(
        {payload},
        'received malformed cross-replica notification'
      );
      return;
    }
    const rows = await this.db`
      SELECT ${this.db(this.selectColumns)}
      FROM ${this.db(this.tableName)}
      WHERE sequence_number = ANY(${sequenceNumbers as number[]}) AND expires_at > now()
      ORDER BY sequence_number ASC
    `;
    for (const row of rows) {
      const item = this.rowToItem(row);
      if (this.markSeen(item.sequenceNumber)) {
        this.emitter.emit('item', item);
      }
    }
  }

  /**
   * The notify to embed in a CTE alongside the INSERT it belongs to, so the
   * notification is atomic with the commit - a crash between them can no
   * longer silently drop it - and costs no separate round trip. Postgres
   * does not execute an unreferenced, non-data-modifying CTE (verified: a
   * `SELECT pg_notify(...)` CTE that nothing selects from is never run), so
   * callers must CROSS JOIN this CTE into the final SELECT to force it.
   * sequenceNumbersExpr is whatever expression yields the array to notify -
   * an aggregate over the inserted CTE's rows for the atomic path (e.g.
   * `(array_agg(sequence_number ORDER BY sequence_number))[1:${NOTIFY_CHUNK_SIZE}]`,
   * capped so the JSON payload can't exceed Postgres's 8000-byte NOTIFY
   * limit), or a literal array for notifyOverflow's extra chunks. Always
   * exact sequence numbers, never a range, so a batch from one replica can't
   * incidentally match a row that belongs to another replica's concurrent
   * write.
   */
  protected notifyFragment(
    sequenceNumbersExpr: postgres.Fragment
  ): postgres.Fragment {
    return this.db`
      pg_notify(
        ${this.notifyChannel},
        json_build_object(
          'instanceId', ${this.instanceId}::text,
          'sequenceNumbers', to_jsonb(${sequenceNumbersExpr})
        )::text
      )
    `;
  }

  /**
   * Notifies for every sequence number beyond what the atomic insert-time
   * notify already covered (NOTIFY_CHUNK_SIZE per statement). Only a batch
   * bigger than that pays for this - each chunk here is a separate,
   * non-atomic round trip, same crash-window caveat the atomic path closes
   * for the first chunk - because there is no way to fit an arbitrarily
   * large batch's exact sequence numbers into one 8000-byte NOTIFY payload.
   */
  protected async notifyOverflow(sequenceNumbers: number[]): Promise<void> {
    for (let i = 0; i < sequenceNumbers.length; i += NOTIFY_CHUNK_SIZE) {
      const chunk = sequenceNumbers.slice(i, i + NOTIFY_CHUNK_SIZE);
      try {
        await this
          .db`SELECT ${this.notifyFragment(this.db`${chunk}::bigint[]`)}`;
      } catch (err) {
        this.logger.warn(
          {err, chunk},
          'failed to publish overflow cross-replica notification'
        );
      }
    }
  }
}
