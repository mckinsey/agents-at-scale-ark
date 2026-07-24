import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import type {MessageData} from '../memory-broker.js';
import {BrokerItem} from './broker-item.js';
import type {Predicate} from './stream.js';
import type {
  ConversationStats,
  MessageFilter,
  MessageStream,
} from './message-stream.js';
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
  extends PostgresStreamBase<MessageData, MessageFilter>
  implements MessageStream
{
  protected readonly tableName = 'messages';
  protected readonly selectColumns = [
    'sequence_number',
    'conversation_id',
    'query_id',
    'message',
    'created_at',
  ];

  constructor(logger: Logger, db: Db, ttlSeconds: number) {
    super(logger, db, ttlSeconds);
  }

  protected rowToItem(row: postgres.Row): BrokerItem<MessageData> {
    return rowToBrokerItem(row as unknown as MessageRow);
  }

  protected whereFor(filter: MessageFilter): postgres.Fragment {
    return this.db`
      ${filter.conversationId ? this.db`AND conversation_id = ${filter.conversationId}` : this.db``}
      ${filter.queryId ? this.db`AND query_id = ${filter.queryId}` : this.db``}
    `;
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
        ${this.db.json(data.message as postgres.JSONValue)},
        now() + make_interval(secs => ${effectiveTtl})
      )
      RETURNING sequence_number, conversation_id, query_id, message, created_at
    `;
    const item = rowToBrokerItem(rows[0]!);
    this.emitter.emit('item', item);
    return item;
  }

  async appendMany(
    dataList: MessageData[],
    ttlSeconds?: number
  ): Promise<BrokerItem<MessageData>[]> {
    if (dataList.length === 0) return [];
    const effectiveTtl = ttlSeconds ?? this.ttlSeconds;
    const valueRows = dataList.map((data) => [
      data.conversationId,
      data.queryId,
      JSON.stringify(data.message),
    ]);
    const inserted = await this.db<MessageRow[]>`
      INSERT INTO messages (conversation_id, query_id, message, expires_at)
      SELECT v.conversation_id, v.query_id, v.message::jsonb, now() + make_interval(secs => ${effectiveTtl})
      FROM (VALUES ${this.db(valueRows)}) AS v(conversation_id, query_id, message)
      RETURNING sequence_number, conversation_id, query_id, message, created_at
    `;
    const items = inserted
      .map(rowToBrokerItem)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    for (const item of items) {
      this.emitter.emit('item', item);
    }
    return items;
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

  async distinctConversationIds(): Promise<string[]> {
    const rows = await this.db<{conversation_id: string}[]>`
      SELECT DISTINCT conversation_id FROM messages WHERE expires_at > now()
    `;
    return rows.map((row) => row.conversation_id);
  }

  async conversationStats(): Promise<ConversationStats[]> {
    const rows = await this.db<
      {conversation_id: string; message_count: number; query_count: number}[]
    >`
      SELECT
        conversation_id,
        count(*)::int AS message_count,
        count(DISTINCT query_id)::int AS query_count
      FROM messages
      WHERE expires_at > now()
      GROUP BY conversation_id
    `;
    return rows.map((row) => ({
      conversationId: row.conversation_id,
      messageCount: row.message_count,
      queryCount: row.query_count,
    }));
  }
}
