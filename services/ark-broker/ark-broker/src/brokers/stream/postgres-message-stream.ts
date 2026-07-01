import {EventEmitter} from 'events';
import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import type {MessageData} from '../memory-broker.js';
import {BrokerItem} from './broker-item.js';
import {
  DEFAULT_LIMIT,
  type PaginatedList,
  type PaginationParams,
} from '../pagination.js';
import type {Predicate} from './stream.js';
import type {MessageStream} from './message-stream.js';

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

export class PostgresMessageStream implements MessageStream {
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly logger: Logger,
    private readonly db: Db,
    private readonly ttlSeconds: number
  ) {}

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

  async filter(
    predicate: Predicate<MessageData>
  ): Promise<BrokerItem<MessageData>[]> {
    return (await this.all()).filter(predicate);
  }

  async paginate(
    params: PaginationParams,
    predicate?: Predicate<MessageData>
  ): Promise<PaginatedList<BrokerItem<MessageData>>> {
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

  async save(): Promise<void> {}

  async getCurrentSequence(): Promise<number> {
    const [{seq}] = await this.db<[{seq: string | null}]>`
      SELECT MAX(sequence_number) as seq FROM messages WHERE expires_at > now()
    `;
    return seq === null ? 0 : Number(seq);
  }

  subscribe(callback: (item: BrokerItem<MessageData>) => void): () => void {
    this.emitter.on('item', callback);
    return (): void => {
      this.emitter.off('item', callback);
    };
  }
}
