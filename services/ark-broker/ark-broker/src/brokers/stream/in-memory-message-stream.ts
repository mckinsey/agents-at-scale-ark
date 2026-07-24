import type {Logger} from '@ark-broker/logging/logger.js';
import type {MessageData} from '../memory-broker.js';
import type {PaginatedList, PaginationParams} from '../pagination.js';
import type {BrokerItem} from './broker-item.js';
import {InMemoryQueryDeletableStream} from './in-memory-query-deletable-stream.js';
import type {
  ConversationStats,
  MessageFilter,
  MessageStream,
} from './message-stream.js';
import {hasScopingField, type Predicate} from './stream.js';

export class InMemoryMessageStream
  extends InMemoryQueryDeletableStream<MessageData>
  implements MessageStream
{
  constructor(logger: Logger, name: string, path?: string, maxItems?: number) {
    super(logger, name, (data) => data.queryId, path, maxItems);
  }

  private predicateFor(filter: MessageFilter): Predicate<MessageData> {
    return (item) =>
      (filter.conversationId === undefined ||
        item.data.conversationId === filter.conversationId) &&
      (filter.queryId === undefined || item.data.queryId === filter.queryId);
  }

  async paginateBy(
    params: PaginationParams,
    filter?: MessageFilter
  ): Promise<PaginatedList<BrokerItem<MessageData>>> {
    return this.paginate(
      params,
      filter ? this.predicateFor(filter) : undefined
    );
  }

  async filterBy(filter: MessageFilter): Promise<BrokerItem<MessageData>[]> {
    const items = await this.filter(this.predicateFor(filter));
    const afterSequence = filter.afterSequence;
    return afterSequence === undefined
      ? items
      : items.filter((item) => item.sequenceNumber > afterSequence);
  }

  async deleteBy(filter: MessageFilter): Promise<void> {
    if (!hasScopingField(filter as Record<string, unknown>)) {
      throw new Error('deleteBy requires at least one filter field');
    }
    return this.delete(this.predicateFor(filter));
  }

  async appendMany(
    dataList: MessageData[],
    ttlSeconds?: number
  ): Promise<BrokerItem<MessageData>[]> {
    const items: BrokerItem<MessageData>[] = [];
    for (const data of dataList) {
      items.push(await this.append(data, ttlSeconds));
    }
    return items;
  }

  async distinctConversationIds(): Promise<string[]> {
    const items = await this.all();
    return Array.from(new Set(items.map((item) => item.data.conversationId)));
  }

  async conversationStats(): Promise<ConversationStats[]> {
    const items = await this.all();
    const statsByConversation = new Map<
      string,
      {messageCount: number; queryIds: Set<string>}
    >();

    for (const item of items) {
      const entry = statsByConversation.get(item.data.conversationId) ?? {
        messageCount: 0,
        queryIds: new Set<string>(),
      };
      entry.messageCount += 1;
      entry.queryIds.add(item.data.queryId);
      statsByConversation.set(item.data.conversationId, entry);
    }

    return Array.from(statsByConversation.entries()).map(
      ([conversationId, entry]) => ({
        conversationId,
        messageCount: entry.messageCount,
        queryCount: entry.queryIds.size,
      })
    );
  }
}
