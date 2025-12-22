import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Operation event emitted by the Ark controller during query lifecycle.
 * Events track operation start, completion, and failure states.
 */
export interface Event {
  /** ISO 8601 timestamp when the event was created */
  timestamp: string;
  /** Event type (Normal, Warning) */
  eventType: string;
  /** Short reason code for the event (e.g., OperationStarted, OperationCompleted, OperationFailed) */
  reason: string;
  /** Human-readable event message */
  message: string;
  /** Structured event data containing context and metadata */
  data: {
    /** Unique identifier for the query that generated this event */
    queryId: string;
    /** Name of the query resource */
    queryName: string;
    /** Kubernetes namespace containing the query */
    queryNamespace: string;
    /** Session identifier for grouping related operations */
    sessionId: string;
    /** Optional conversation identifier for multi-turn interactions */
    conversationId?: string;
    /** Operation name being tracked (e.g., tool execution, model invocation) */
    operation?: string;
    /** Duration of completed operations in milliseconds */
    durationMs?: string;
    /** Error message for failed operations */
    error?: string;
    /** Additional event-specific metadata */
    [key: string]: any;
  };
}

export class EventStore {
  private events: Event[] = [];
  private subscribers: Map<string, Set<(event: Event) => void>> = new Map();
  private allSubscribers: Set<(event: Event) => void> = new Set();
  private maxEvents = 10000;
  private readonly eventFilePath?: string;

  constructor() {
    this.eventFilePath = process.env.EVENT_FILE_PATH;
    this.loadFromFile();
  }

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
    this.saveToFile();
    console.log('[EVENT PURGE] Cleared all events');
  }

  private loadFromFile(): void {
    if (!this.eventFilePath) {
      console.log('[EVENT LOAD] File persistence disabled - events will not be saved');
      return;
    }

    try {
      if (existsSync(this.eventFilePath)) {
        const data = readFileSync(this.eventFilePath, 'utf-8');
        const parsed = JSON.parse(data);

        if (parsed && Array.isArray(parsed.events)) {
          this.events = parsed.events;
          console.log(`[EVENT LOAD] Loaded ${this.events.length} events from ${this.eventFilePath}`);
        } else {
          console.warn('[EVENT LOAD] Invalid data format in event file, starting fresh');
        }
      } else {
        console.log(`[EVENT LOAD] Event file not found at ${this.eventFilePath}, starting with 0 events`);
      }
    } catch (error) {
      console.error(`[EVENT LOAD] Failed to load events from file: ${error}`);
    }
  }

  private saveToFile(): void {
    if (!this.eventFilePath) return;

    try {
      const dir = dirname(this.eventFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const dataToSave = {
        events: this.events
      };
      writeFileSync(this.eventFilePath, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
      console.error(`[EVENT SAVE] Failed to save events to file: ${error}`);
    }
  }

  public saveEvents(): void {
    this.saveToFile();
  }
}
