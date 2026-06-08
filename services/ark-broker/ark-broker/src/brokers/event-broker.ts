import {BrokerItem} from './stream/broker-item.js';
import {Stream} from './stream/stream.js';
import {InMemoryStream} from './stream/in-memory-stream.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import {PaginatedList, PaginationParams} from './pagination.js';

/** Event data from Ark controller operations */
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

/**
 * Broker for storing Ark controller operation events.
 * Events are grouped by query ID.
 */
export class EventBroker {
  private stream: Stream<EventData>;

  constructor(logger: Logger, path?: string, maxItems?: number) {
    this.stream = new InMemoryStream<EventData>(
      logger,
      'Event',
      path,
      maxItems
    );
  }

  async addEvent(event: EventData): Promise<BrokerItem<EventData>> {
    return this.stream.append(event);
  }

  async getByQuery(queryId: string): Promise<BrokerItem<EventData>[]> {
    return this.stream.filter((item) => item.data.data.queryId === queryId);
  }

  async getEventsByQuery(queryId: string): Promise<EventData[]> {
    const items = await this.getByQuery(queryId);
    return items.map((item) => item.data);
  }

  async all(): Promise<BrokerItem<EventData>[]> {
    return this.stream.all();
  }

  async save(): Promise<void> {
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

  async paginate(params: PaginationParams): Promise<PaginatedList<BrokerItem<EventData>>> {
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
