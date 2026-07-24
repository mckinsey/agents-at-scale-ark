import type {Logger} from '@ark-broker/logging/logger.js';
import type {EventData, EventFilter, EventStream} from '../event-broker.js';
import type {PaginatedList, PaginationParams} from '../pagination.js';
import type {BrokerItem} from './broker-item.js';
import {InMemoryQueryDeletableStream} from './in-memory-query-deletable-stream.js';
import {hasScopingField, type Predicate} from './stream.js';

export class InMemoryEventStream
  extends InMemoryQueryDeletableStream<EventData>
  implements EventStream
{
  constructor(logger: Logger, name: string, path?: string, maxItems?: number) {
    super(logger, name, (data) => data.data.queryId, path, maxItems);
  }

  private predicateFor(filter: EventFilter): Predicate<EventData> {
    return (item) =>
      (filter.queryId === undefined ||
        item.data.data.queryId === filter.queryId) &&
      (filter.sessionId === undefined ||
        item.data.data.sessionId === filter.sessionId);
  }

  async paginateBy(
    params: PaginationParams,
    filter?: EventFilter
  ): Promise<PaginatedList<BrokerItem<EventData>>> {
    return this.paginate(
      params,
      filter ? this.predicateFor(filter) : undefined
    );
  }

  async filterBy(filter: EventFilter): Promise<BrokerItem<EventData>[]> {
    const items = await this.filter(this.predicateFor(filter));
    const afterSequence = filter.afterSequence;
    return afterSequence === undefined
      ? items
      : items.filter((item) => item.sequenceNumber > afterSequence);
  }

  async deleteBy(filter: EventFilter): Promise<void> {
    if (!hasScopingField(filter as Record<string, unknown>)) {
      throw new Error('deleteBy requires at least one filter field');
    }
    return this.delete(this.predicateFor(filter));
  }
}
