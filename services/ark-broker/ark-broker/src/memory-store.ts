import { Message, StoredMessage } from './types.js';
import { EventEmitter } from 'events';
import { JsonFileStore } from './json-file-store';

type StoredMessageWithType<T> = Omit<StoredMessage, 'message'> & { message: T };

export class MemoryStore<TMessage extends Message = Message> {
  private messages: StoredMessageWithType<TMessage>[] = [];
  private fileStore: JsonFileStore<StoredMessageWithType<TMessage>[]>;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    const maxMessages = process.env.MAX_MESSAGES ? parseInt(process.env.MAX_MESSAGES, 10) : 0;

    this.fileStore = new JsonFileStore<StoredMessageWithType<TMessage>[]>(
      'Memory',
      process.env.MEMORY_FILE_PATH,
      (d) => d.length,
      maxMessages
    );
    this.messages = this.fileStore.load() ?? [];
  }

  private validateConversationID(conversationID: string): void {
    if (!conversationID || typeof conversationID !== 'string') {
      throw new Error('Conversation ID cannot be empty');
    }
  }

  addMessage(conversationID: string, message: TMessage): void {
    this.validateConversationID(conversationID);

    const isNewConversation = !this.messages.some(m => m.conversation_id === conversationID);

    const storedMessage: Omit<StoredMessage, 'message'> & { message: TMessage } = {
      timestamp: new Date().toISOString(),
      conversation_id: conversationID,
      query_id: '',
      message,
      sequence: this.messages.length + 1
    };

    this.messages.push(storedMessage);
    this.save();

    if (isNewConversation) {
      this.emitConversationCreated(conversationID);
    }

    this.eventEmitter.emit(`message:${conversationID}`, message);
    this.eventEmitter.emit('message:*', storedMessage);
  }

  addMessages(conversationID: string, messages: TMessage[]): void {
    this.validateConversationID(conversationID);

    const isNewConversation = !this.messages.some(m => m.conversation_id === conversationID);

    const timestamp = new Date().toISOString();
    const storedMessages = messages.map((msg, index) => ({
      timestamp,
      conversation_id: conversationID,
      query_id: '',
      message: msg,
      sequence: this.messages.length + index + 1
    }));

    this.messages.push(...storedMessages);
    this.save();

    if (isNewConversation) {
      this.emitConversationCreated(conversationID);
    }

    for (const stored of storedMessages) {
      this.eventEmitter.emit(`message:${conversationID}`, stored.message);
      this.eventEmitter.emit('message:*', stored);
    }
  }

  addMessagesWithMetadata(conversationID: string, queryID: string, messages: TMessage[]): void {
    this.validateConversationID(conversationID);

    if (!queryID) {
      throw new Error('Query ID cannot be empty');
    }

    const isNewConversation = !this.messages.some(m => m.conversation_id === conversationID);

    const timestamp = new Date().toISOString();
    const storedMessages = messages.map((msg, index) => ({
      timestamp,
      conversation_id: conversationID,
      query_id: queryID,
      message: msg,
      sequence: this.messages.length + index + 1
    }));

    this.messages.push(...storedMessages);
    this.save();

    if (isNewConversation) {
      this.emitConversationCreated(conversationID);
    }

    for (const stored of storedMessages) {
      this.eventEmitter.emit(`message:${conversationID}`, stored.message);
      this.eventEmitter.emit('message:*', stored);
    }
  }

  getMessages(conversationID: string): TMessage[] {
    this.validateConversationID(conversationID);
    // Return just the message content for backward compatibility
    return this.messages
      .filter(m => m.conversation_id === conversationID)
      .map(m => m.message);
  }

  getMessagesByQuery(queryID: string): TMessage[] {
    if (!queryID) {
      throw new Error('Query ID cannot be empty');
    }
    // Return messages filtered by query_id
    return this.messages
      .filter(m => m.query_id === queryID)
      .map(m => m.message);
  }

  getMessagesWithMetadata(conversationID: string, queryID?: string): StoredMessageWithType<TMessage>[] {
    this.validateConversationID(conversationID);
    let filtered = this.messages.filter(m => m.conversation_id === conversationID);
    if (queryID) {
      filtered = filtered.filter(m => m.query_id === queryID);
    }
    return filtered;
  }

  clearConversation(conversationID: string): void {
    this.validateConversationID(conversationID);
    this.messages = this.messages.filter(m => m.conversation_id !== conversationID);
    this.save();
  }

  clearQuery(conversationID: string, queryID: string): void {
    this.validateConversationID(conversationID);
    if (!queryID) {
      throw new Error('Query ID cannot be empty');
    }
    this.messages = this.messages.filter(m => !(m.conversation_id === conversationID && m.query_id === queryID));
    this.save();
  }

  getConversations(): string[] {
    // Get unique conversation IDs from the flat list, filtering out null/undefined
    const conversationSet = new Set(
      this.messages
        .map(m => m.conversation_id)
        .filter(id => id != null)
    );
    return Array.from(conversationSet);
  }

  getAllConversations(): string[] {
    // Alias for getConversations() for clarity
    return this.getConversations();
  }

  getAllMessages(): StoredMessageWithType<TMessage>[] {
    // Return all messages from the flat list
    return this.messages;
  }

  getStats(): { conversations: number; totalMessages: number } {
    const uniqueConversations = new Set(this.messages.map(m => m.conversation_id));

    return {
      conversations: uniqueConversations.size,
      totalMessages: this.messages.length
    };
  }

  isHealthy(): boolean {
    return true;
  }

  purge(): void {
    this.messages = [];
    this.save();
    console.log('[Memory] purged');
  }

  save(): void {
    this.fileStore.save(this.messages);
  }

  // Streaming support methods
  conversationExists(conversationID: string): boolean {
    return this.messages.some(m => m.conversation_id === conversationID);
  }

  subscribe(conversationID: string, callback: (message: TMessage) => void): () => void {
    this.eventEmitter.on(`message:${conversationID}`, callback);
    return () => {
      this.eventEmitter.off(`message:${conversationID}`, callback);
    };
  }

  subscribeToAllMessages(callback: (storedMessage: StoredMessageWithType<TMessage>) => void): () => void {
    const listener = (storedMessage: StoredMessageWithType<TMessage>) => callback(storedMessage);
    this.eventEmitter.on('message:*', listener);
    return () => this.eventEmitter.off('message:*', listener);
  }

  subscribeToMessages(conversationID: string, callback: (chunk: TMessage) => void): () => void {
    this.eventEmitter.on(`chunk:${conversationID}`, callback);
    return () => {
      this.eventEmitter.off(`chunk:${conversationID}`, callback);
    };
  }

  waitForConversation(conversationID: string, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.conversationExists(conversationID)) {
        resolve(true);
        return;
      }

      const timer = setTimeout(() => {
        this.eventEmitter.off(`conversation:${conversationID}:created`, onCreated);
        resolve(false);
      }, timeout);

      const onCreated = () => {
        clearTimeout(timer);
        resolve(true);
      };

      this.eventEmitter.once(`conversation:${conversationID}:created`, onCreated);
    });
  }

  private emitConversationCreated(conversationID: string): void {
    this.eventEmitter.emit(`conversation:${conversationID}:created`);
  }

}