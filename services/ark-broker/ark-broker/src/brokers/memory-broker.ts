import {BrokerItem} from './stream/broker-item.js';
import type {MessageStream} from './stream/message-stream.js';
import {PaginatedList, PaginationParams} from './pagination.js';

export type Message = unknown;

export interface MessageData {
  conversationId: string;
  queryId: string;
  message: Message;
}

export class MemoryBroker {
  private readonly stream: MessageStream;

  constructor(stream: MessageStream) {
    this.stream = stream;
  }

  async addMessage(
    conversationId: string,
    queryId: string,
    message: Message,
    ttlSeconds?: number
  ): Promise<BrokerItem<MessageData>> {
    return this.stream.append({conversationId, queryId, message}, ttlSeconds);
  }

  async addMessages(
    conversationId: string,
    queryId: string,
    messages: Message[],
    ttlSeconds?: number
  ): Promise<BrokerItem<MessageData>[]> {
    const items: BrokerItem<MessageData>[] = [];
    for (const message of messages) {
      items.push(
        await this.addMessage(conversationId, queryId, message, ttlSeconds)
      );
    }
    return items;
  }

  async getByConversation(
    conversationId: string
  ): Promise<BrokerItem<MessageData>[]> {
    return this.stream.filter(
      (item) => item.data.conversationId === conversationId
    );
  }

  async getByQuery(queryId: string): Promise<BrokerItem<MessageData>[]> {
    return this.stream.filter((item) => item.data.queryId === queryId);
  }

  async getConversationIds(): Promise<string[]> {
    const all = await this.stream.all();
    const ids = new Set(all.map((item) => item.data.conversationId));
    return Array.from(ids);
  }

  all(): Promise<BrokerItem<MessageData>[]> {
    return this.stream.all();
  }

  save(): Promise<void> {
    return this.stream.save();
  }

  async delete(): Promise<void> {
    return this.stream.delete();
  }

  async deleteConversation(conversationId: string): Promise<void> {
    return this.stream.delete(
      (item) => item.data.conversationId === conversationId
    );
  }

  async deleteQuery(conversationId: string, queryId: string): Promise<void> {
    return this.stream.delete(
      (item) =>
        item.data.conversationId === conversationId &&
        item.data.queryId === queryId
    );
  }

  async deleteByQuery(queryId: string): Promise<void> {
    return this.stream.deleteByQuery(queryId);
  }

  subscribe(callback: (item: BrokerItem<MessageData>) => void): () => void {
    return this.stream.subscribe(callback);
  }

  subscribeToConversation(
    conversationId: string,
    callback: (item: BrokerItem<MessageData>) => void
  ): () => void {
    return this.stream.subscribe((item) => {
      if (item.data.conversationId === conversationId) {
        callback(item);
      }
    });
  }

  async paginate(
    params: PaginationParams,
    filters?: {conversationId?: string; queryId?: string}
  ): Promise<PaginatedList<BrokerItem<MessageData>>> {
    const predicate = filters
      ? (item: BrokerItem<MessageData>): boolean => {
          if (
            filters.conversationId &&
            item.data.conversationId !== filters.conversationId
          )
            return false;
          if (filters.queryId && item.data.queryId !== filters.queryId)
            return false;
          return true;
        }
      : undefined;
    return this.stream.paginate(params, predicate);
  }

  async getCurrentSequence(): Promise<number> {
    return this.stream.getCurrentSequence();
  }
}
