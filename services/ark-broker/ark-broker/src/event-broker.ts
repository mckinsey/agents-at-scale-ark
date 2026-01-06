import { BrokerItem } from './broker-item.js';
import { BrokerItemStream } from './broker-item-stream.js';
import { PaginatedList, PaginationParams } from './pagination.js';

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
  private stream: BrokerItemStream<EventData>;

  constructor(path?: string, maxItems?: number) {
    this.stream = new BrokerItemStream<EventData>('Event', path, maxItems);
  }

  addEvent(event: EventData): BrokerItem<EventData> {
    return this.stream.append(event);
  }

  getByQuery(queryId: string): BrokerItem<EventData>[] {
    return this.stream.filter(item => item.data.data.queryId === queryId);
  }

  getEventsByQuery(queryId: string): EventData[] {
    return this.getByQuery(queryId).map(item => item.data);
  }

  all(): BrokerItem<EventData>[] {
    return this.stream.all();
  }

  save(): void {
    this.stream.save();
  }

  delete(): void {
    this.stream.delete();
  }

  subscribe(callback: (item: BrokerItem<EventData>) => void): () => void {
    return this.stream.subscribe(callback);
  }

  subscribeToQuery(queryId: string, callback: (item: BrokerItem<EventData>) => void): () => void {
    return this.stream.subscribe(item => {
      if (item.data.data.queryId === queryId) {
        callback(item);
      }
    });
  }

  paginate(params: PaginationParams): PaginatedList<BrokerItem<EventData>> {
    return this.stream.paginate(params);
  }

  paginateByQuery(queryId: string, params: PaginationParams): PaginatedList<BrokerItem<EventData>> {
    return this.stream.paginate(params, item => item.data.data.queryId === queryId);
  }

  getCurrentSequence(): number {
    return this.stream.getCurrentSequence();
  }
}
