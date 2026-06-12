import {BrokerItem} from './stream/broker-item.js';
import {InMemoryStream} from './stream/in-memory-stream.js';
import type {Stream} from './stream/stream.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import {PaginatedList, PaginationParams} from './pagination.js';

export type Message = unknown;

export interface MessageData {
  conversationId: string;
  queryId: string;
  message: Message;
}

export class MemoryBroker {
  private readonly stream: Stream<MessageData>;

  constructor(logger: Logger, path?: string, maxItems?: number) {
    this.stream = new InMemoryStream<MessageData>(
      logger,
      'Memory',
      path,
      maxItems
    );
  }

  async addMessage(
    conversationId: string,
    queryId: string,
    message: Message
  ): Promise<BrokerItem<MessageData>> {
    return this.stream.append({conversationId, queryId, message});
  }

  async addMessages(
    conversationId: string,
    queryId: string,
    messages: Message[]
  ): Promise<BrokerItem<MessageData>[]> {
    const items: BrokerItem<MessageData>[] = [];
    for (const message of messages) {
      items.push(await this.addMessage(conversationId, queryId, message));
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
