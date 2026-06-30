import {EventEmitter} from 'events';
import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import type {EventData} from '../event-broker.js';
import {BrokerItem} from './broker-item.js';
import {
  DEFAULT_LIMIT,
  type PaginatedList,
  type PaginationParams,
} from '../pagination.js';
import type {Predicate, Stream} from './stream.js';

type EventRow = {
  sequence_number: string;
  query_id: string;
  session_id: string | null;
  reason: string | null;
  event: unknown;
  created_at: Date;
};

function rowToBrokerItem(row: EventRow): BrokerItem<EventData> {
  return {
    sequenceNumber: Number(row.sequence_number),
    timestamp: row.created_at,
    data: row.event as EventData,
  };
}

export class PostgresEventStream implements Stream<EventData> {
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly logger: Logger,
    private readonly db: Db,
    private readonly ttlSeconds: number
  ) {}

  async append(
    data: EventData,
    ttlSeconds?: number
  ): Promise<BrokerItem<EventData>> {
    const effectiveTtl = ttlSeconds ?? this.ttlSeconds;
    const rows = await this.db<EventRow[]>`
      INSERT INTO events (query_id, session_id, reason, event, expires_at)
      VALUES (
        ${data.data.queryId},
        ${data.data.sessionId ?? null},
        ${data.reason ?? null},
        ${this.db.json(data as unknown as postgres.JSONValue)},
        now() + make_interval(secs => ${effectiveTtl})
      )
      RETURNING sequence_number, query_id, session_id, reason, event, created_at
    `;
    const item = rowToBrokerItem(rows[0]!);
    this.emitter.emit('item', item);
    return item;
  }

  async all(): Promise<BrokerItem<EventData>[]> {
    const rows = await this.db<EventRow[]>`
      SELECT sequence_number, query_id, session_id, reason, event, created_at
      FROM events
      WHERE expires_at > now()
      ORDER BY sequence_number ASC
    `;
    return rows.map(rowToBrokerItem);
  }

  async filter(
    predicate: Predicate<EventData>
  ): Promise<BrokerItem<EventData>[]> {
    return (await this.all()).filter(predicate);
  }

  async paginate(
    params: PaginationParams,
    predicate?: Predicate<EventData>
  ): Promise<PaginatedList<BrokerItem<EventData>>> {
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

    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore ? items.at(-1)!.sequenceNumber : undefined,
    };
  }

  async delete(predicate?: Predicate<EventData>): Promise<void> {
    if (!predicate) {
      this.logger.info('deleting all events');
      await this.db`DELETE FROM events`;
      return;
    }
    const items = await this.all();
    const toDelete = items.filter(predicate).map((item) => item.sequenceNumber);
    if (toDelete.length === 0) return;
    await this.db`DELETE FROM events WHERE sequence_number = ANY(${toDelete})`;
  }

  async save(): Promise<void> {}

  async getCurrentSequence(): Promise<number> {
    const [{seq}] = await this.db<[{seq: string | null}]>`
      SELECT MAX(sequence_number) as seq FROM events WHERE expires_at > now()
    `;
    return seq === null ? 0 : Number(seq);
  }

  subscribe(callback: (item: BrokerItem<EventData>) => void): () => void {
    this.emitter.on('item', callback);
    return (): void => {
      this.emitter.off('item', callback);
    };
  }
}
