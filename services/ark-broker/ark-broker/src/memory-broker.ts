import { BrokerItem } from './broker-item.js';
import { BrokerItemStream } from './broker-item-stream.js';
import { PaginatedList, PaginationParams } from './pagination.js';

/** OpenAI-format message (role, content, etc.) */
export type Message = unknown;

/** Data payload for memory broker items */
export interface MessageData {
  conversationId: string;
  queryId: string;
  message: Message;
}

/**
 * Broker for storing conversation messages.
 * Messages are grouped by conversation and query IDs.
 */
export class MemoryBroker {
  private stream: BrokerItemStream<MessageData>;

  constructor(path?: string, maxItems?: number) {
    this.stream = new BrokerItemStream<MessageData>('Memory', path, maxItems);
  }

  addMessage(conversationId: string, queryId: string, message: Message): BrokerItem<MessageData> {
    return this.stream.append({ conversationId, queryId, message });
  }

  addMessages(conversationId: string, queryId: string, messages: Message[]): BrokerItem<MessageData>[] {
    return messages.map(message => this.addMessage(conversationId, queryId, message));
  }

  getByConversation(conversationId: string): BrokerItem<MessageData>[] {
    return this.stream.filter(item => item.data.conversationId === conversationId);
  }

  getByQuery(queryId: string): BrokerItem<MessageData>[] {
    return this.stream.filter(item => item.data.queryId === queryId);
  }

  getConversationIds(): string[] {
    const ids = new Set(this.stream.all().map(item => item.data.conversationId));
    return Array.from(ids);
  }

  all(): BrokerItem<MessageData>[] {
    return this.stream.all();
  }

  save(): void {
    this.stream.save();
  }

  delete(): void {
    this.stream.delete();
  }

  deleteConversation(conversationId: string): void {
    this.stream.delete(item => item.data.conversationId === conversationId);
  }

  deleteQuery(conversationId: string, queryId: string): void {
    this.stream.delete(item =>
      item.data.conversationId === conversationId && item.data.queryId === queryId
    );
  }

  subscribe(callback: (item: BrokerItem<MessageData>) => void): () => void {
    return this.stream.subscribe(callback);
  }

  subscribeToConversation(conversationId: string, callback: (item: BrokerItem<MessageData>) => void): () => void {
    return this.stream.subscribe(item => {
      if (item.data.conversationId === conversationId) {
        callback(item);
      }
    });
  }

  paginate(params: PaginationParams, filters?: { conversationId?: string; queryId?: string }): PaginatedList<BrokerItem<MessageData>> {
    const predicate = filters
      ? (item: BrokerItem<MessageData>) => {
          if (filters.conversationId && item.data.conversationId !== filters.conversationId) return false;
          if (filters.queryId && item.data.queryId !== filters.queryId) return false;
          return true;
        }
      : undefined;
    return this.stream.paginate(params, predicate);
  }

  getCurrentSequence(): number {
    return this.stream.getCurrentSequence();
  }
}
