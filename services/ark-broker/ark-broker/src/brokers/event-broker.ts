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

export type EventStream = Stream<EventData>;

export class EventBroker {
  private readonly stream: Stream<EventData>;

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
    return this.stream.filter((item) => item.data.data.queryId === queryId);
  }

  async getEventsByQuery(queryId: string): Promise<EventData[]> {
    return (await this.getByQuery(queryId)).map((item) => item.data);
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
    return this.stream.paginate(params);
  }

  async paginateByQuery(
    queryId: string,
    params: PaginationParams
  ): Promise<PaginatedList<BrokerItem<EventData>>> {
    return this.stream.paginate(
      params,
      (item) => item.data.data.queryId === queryId
    );
  }

  async paginateBySessionId(
    sessionId: string,
    params: PaginationParams
  ): Promise<PaginatedList<BrokerItem<EventData>>> {
    return this.stream.paginate(
      params,
      (item) => item.data.data.sessionId === sessionId
    );
  }

  async getCurrentSequence(): Promise<number> {
    return this.stream.getCurrentSequence();
  }
}
