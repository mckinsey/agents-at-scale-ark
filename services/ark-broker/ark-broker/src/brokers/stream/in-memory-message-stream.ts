import type {Logger} from '@ark-broker/logging/logger.js';
import type {MessageData} from '../memory-broker.js';
import type {PaginatedList, PaginationParams} from '../pagination.js';
import type {BrokerItem} from './broker-item.js';
import {InMemoryQueryDeletableStream} from './in-memory-query-deletable-stream.js';
import type {MessageFilter, MessageStream} from './message-stream.js';
import type {Predicate} from './stream.js';

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
    const hasScopingField = Object.entries(
      filter as Record<string, unknown>
    ).some(([key, value]) => key !== 'afterSequence' && value !== undefined);
    if (!hasScopingField) {
      throw new Error('deleteBy requires at least one filter field');
    }
    return this.delete(this.predicateFor(filter));
  }
}
