import {BrokerItem} from './stream/broker-item.js';
import type {Stream} from './stream/stream.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import {PaginatedList, PaginationParams} from './pagination.js';

export interface EventData {
  timestamp: string;
  eventType: string;
  reason: string;
  message: string;
  data: {
    queryId: string;
    queryName: string;
    queryNamespace: string;
    sessionId: string;
    conversationId?: string;
    operation?: string;
    durationMs?: string;
    error?: string;
    [key: string]: unknown;
  };
}

export interface EventFilter {
  queryId?: string;
  sessionId?: string;
  afterSequence?: number;
}

export interface EventStream extends Stream<EventData> {
  deleteByQuery(queryId: string): Promise<void>;
  paginateBy(
    params: PaginationParams,
    filter?: EventFilter
  ): Promise<PaginatedList<BrokerItem<EventData>>>;
  filterBy(filter: EventFilter): Promise<BrokerItem<EventData>[]>;
  deleteBy(filter: EventFilter): Promise<void>;
}

export class EventBroker {
  private readonly stream: EventStream;

  constructor(stream: EventStream, _logger?: Logger) {
    this.stream = stream;
  }

  async addEvent(
    event: EventData,
    ttlSeconds?: number
  ): Promise<BrokerItem<EventData>> {
    return this.stream.append(event, ttlSeconds);
  }

  async getByQuery(queryId: string): Promise<BrokerItem<EventData>[]> {
    return this.stream.filterBy({queryId});
  }

  async getEventsByQuery(queryId: string): Promise<EventData[]> {
    return (await this.getByQuery(queryId)).map((item) => item.data);
  }

  async eventsAfter(
    cursor: number,
    sessionId?: string
  ): Promise<BrokerItem<EventData>[]> {
    return this.stream.filterBy({sessionId, afterSequence: cursor});
  }

  async queryEventsAfter(
    queryId: string,
    cursor: number
  ): Promise<BrokerItem<EventData>[]> {
    return this.stream.filterBy({queryId, afterSequence: cursor});
  }

  all(): Promise<BrokerItem<EventData>[]> {
    return this.stream.all();
  }

  save(): Promise<void> {
    return this.stream.save();
  }

  async delete(): Promise<void> {
    return this.stream.delete();
  }

  async deleteByQuery(queryId: string): Promise<void> {
    return this.stream.deleteByQuery(queryId);
  }

  subscribe(callback: (item: BrokerItem<EventData>) => void): () => void {
    return this.stream.subscribe(callback);
  }

  subscribeToQuery(
    queryId: string,
    callback: (item: BrokerItem<EventData>) => void
  ): () => void {
    return this.stream.subscribe((item) => {
      if (item.data.data.queryId === queryId) {
        callback(item);
      }
    });
  }

  async paginate(
    params: PaginationParams
  ): Promise<PaginatedList<BrokerItem<EventData>>> {
    return this.stream.paginateBy(params);
  }

  async paginateByQuery(
    queryId: string,
    params: PaginationParams
  ): Promise<PaginatedList<BrokerItem<EventData>>> {
    return this.stream.paginateBy(params, {queryId});
  }

  async paginateBySessionId(
    sessionId: string,
    params: PaginationParams
  ): Promise<PaginatedList<BrokerItem<EventData>>> {
    return this.stream.paginateBy(params, {sessionId});
  }

  async getCurrentSequence(): Promise<number> {
    return this.stream.getCurrentSequence();
  }
}
