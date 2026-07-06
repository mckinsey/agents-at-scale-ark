import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import type {MessageData} from '../memory-broker.js';
import {BrokerItem} from './broker-item.js';
import type {Predicate} from './stream.js';
import type {MessageStream} from './message-stream.js';
import {PostgresStreamBase} from './postgres-stream-base.js';

type MessageRow = {
  sequence_number: string;
  conversation_id: string;
  query_id: string;
  message: unknown;
  created_at: Date;
};

function rowToBrokerItem(row: MessageRow): BrokerItem<MessageData> {
  return {
    sequenceNumber: Number(row.sequence_number),
    timestamp: row.created_at,
    data: {
      conversationId: row.conversation_id,
      queryId: row.query_id,
      message: row.message,
    },
  };
}

export class PostgresMessageStream
  extends PostgresStreamBase<MessageData>
  implements MessageStream
{
  constructor(
    private readonly logger: Logger,
    private readonly db: Db,
    private readonly ttlSeconds: number
  ) {
    super();
  }

  async append(
    data: MessageData,
    ttlSeconds?: number
  ): Promise<BrokerItem<MessageData>> {
    const effectiveTtl = ttlSeconds ?? this.ttlSeconds;
    const rows = await this.db<MessageRow[]>`
      INSERT INTO messages (conversation_id, query_id, message, expires_at)
      VALUES (
        ${data.conversationId},
        ${data.queryId},
        ${this.db.json(data.message as unknown as postgres.JSONValue)},
        now() + make_interval(secs => ${effectiveTtl})
      )
      RETURNING sequence_number, conversation_id, query_id, message, created_at
    `;
    const item = rowToBrokerItem(rows[0]!);
    this.emitter.emit('item', item);
    return item;
  }

  async all(): Promise<BrokerItem<MessageData>[]> {
    const rows = await this.db<MessageRow[]>`
      SELECT sequence_number, conversation_id, query_id, message, created_at
      FROM messages
      WHERE expires_at > now()
      ORDER BY sequence_number ASC
    `;
    return rows.map(rowToBrokerItem);
  }

  async delete(predicate?: Predicate<MessageData>): Promise<void> {
    if (!predicate) {
      this.logger.info('deleting all messages');
      await this.db`DELETE FROM messages`;
      return;
    }
    const items = await this.all();
    const toDelete = items.filter(predicate).map((item) => item.sequenceNumber);
    if (toDelete.length === 0) return;
    await this
      .db`DELETE FROM messages WHERE sequence_number = ANY(${toDelete})`;
  }

  async deleteByQuery(queryId: string): Promise<void> {
    this.logger.info({queryId}, 'deleting messages by query');
    await this.db`DELETE FROM messages WHERE query_id = ${queryId}`;
  }

  async getCurrentSequence(): Promise<number> {
    const [{seq}] = await this.db<[{seq: string | null}]>`
      SELECT MAX(sequence_number) as seq FROM messages WHERE expires_at > now()
    `;
    return seq === null ? 0 : Number(seq);
  }
}
