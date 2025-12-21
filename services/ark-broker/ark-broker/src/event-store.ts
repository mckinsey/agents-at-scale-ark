export interface Event {
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
    [key: string]: any;
  };
}

export class EventStore {
  private events: Event[] = [];
  private subscribers: Map<string, Set<(event: Event) => void>> = new Map();
  private allSubscribers: Set<(event: Event) => void> = new Set();
  private maxEvents = 10000;

  addEvent(event: Event): void {
    this.events.push(event);

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    const queryId = event.data.queryId;
    if (queryId) {
      const querySubscribers = this.subscribers.get(queryId);
      if (querySubscribers) {
        for (const callback of querySubscribers) {
          try {
            callback(event);
          } catch (error) {
            console.error('Error in query subscriber callback:', error);
          }
        }
      }
    }

    for (const callback of this.allSubscribers) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in all-events subscriber callback:', error);
      }
    }
  }

  getEvents(): Event[] {
    return this.events;
  }

  getEventsByQuery(queryId: string): Event[] {
    return this.events.filter(event => event.data.queryId === queryId);
  }

  subscribeToQuery(queryId: string, callback: (event: Event) => void): () => void {
    if (!this.subscribers.has(queryId)) {
      this.subscribers.set(queryId, new Set());
    }
    this.subscribers.get(queryId)!.add(callback);

    return () => {
      const querySubscribers = this.subscribers.get(queryId);
      if (querySubscribers) {
        querySubscribers.delete(callback);
        if (querySubscribers.size === 0) {
          this.subscribers.delete(queryId);
        }
      }
    };
  }

  subscribeToAll(callback: (event: Event) => void): () => void {
    this.allSubscribers.add(callback);
    return () => {
      this.allSubscribers.delete(callback);
    };
  }

  purge(): void {
    this.events = [];
    console.log('Event store purged');
  }
}
