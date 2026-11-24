import {BrokerItem} from './stream/broker-item.js';
import type {
  ConversationStats,
  MessageStream,
} from './stream/message-stream.js';
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
    return this.stream.appendMany(
      messages.map((message) => ({conversationId, queryId, message})),
      ttlSeconds
    );
  }

  async getByConversation(
    conversationId: string
  ): Promise<BrokerItem<MessageData>[]> {
    return this.stream.filterBy({conversationId});
  }

  async getByQuery(queryId: string): Promise<BrokerItem<MessageData>[]> {
    return this.stream.filterBy({queryId});
  }

  async messagesAfter(
    cursor: number,
    conversationId?: string
  ): Promise<BrokerItem<MessageData>[]> {
    return this.stream.filterBy({conversationId, afterSequence: cursor});
  }

  async getConversationIds(): Promise<string[]> {
    return this.stream.distinctConversationIds();
  }

  async getConversationStats(): Promise<ConversationStats[]> {
    return this.stream.conversationStats();
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
    return this.stream.deleteBy({conversationId});
  }

  async deleteQuery(conversationId: string, queryId: string): Promise<void> {
    return this.stream.deleteBy({conversationId, queryId});
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
    return this.stream.paginateBy(params, filters);
  }

  async getCurrentSequence(): Promise<number> {
    return this.stream.getCurrentSequence();
  }
}
