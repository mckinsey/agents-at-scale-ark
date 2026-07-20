import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import type {EventData, EventStream} from '../event-broker.js';
import {BrokerItem} from './broker-item.js';
import type {Predicate} from './stream.js';
import {PostgresStreamBase} from './postgres-stream-base.js';

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

export class PostgresEventStream
  extends PostgresStreamBase<EventData>
  implements EventStream
{
  constructor(
    private readonly logger: Logger,
    private readonly db: Db,
    private readonly ttlSeconds: number
  ) {
    super();
  }

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

  async deleteByQuery(queryId: string): Promise<void> {
    this.logger.info({queryId}, 'deleting events by query');
    await this.db`DELETE FROM events WHERE query_id = ${queryId}`;
  }

  async getCurrentSequence(): Promise<number> {
    const [{seq}] = await this.db<[{seq: string | null}]>`
      SELECT MAX(sequence_number) as seq FROM events WHERE expires_at > now()
    `;
    return seq === null ? 0 : Number(seq);
  }
}
