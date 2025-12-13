import { Message, StoredMessage } from './types.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { EventEmitter } from 'events';

export class MemoryStore<TMessage extends Message = Message> {
  // Flat list of all messages with metadata
  private messages: Array<Omit<StoredMessage, 'message'> & { message: TMessage }> = [];
  private readonly maxMessageSize: number;
  private readonly memoryFilePath?: string;
  private readonly maxMemoryDb: number;
  private readonly maxItemAge: number;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor(maxMessageSize?: number) {
    // Use MAX_MESSAGE_SIZE_MB env var or default to 10MB
    const maxSizeMB = process.env.MAX_MESSAGE_SIZE_MB ? parseInt(process.env.MAX_MESSAGE_SIZE_MB, 10) : 10;
    this.maxMessageSize = maxMessageSize ?? (maxSizeMB * 1024 * 1024);
    this.memoryFilePath = process.env.MEMORY_FILE_PATH;
    
    // Cleanup configuration
    this.maxMemoryDb = process.env.MAX_MEMORY_DB ? parseInt(process.env.MAX_MEMORY_DB, 10) : 0;
    this.maxItemAge = process.env.MAX_ITEM_AGE ? parseInt(process.env.MAX_ITEM_AGE, 10) : 0;

    this.loadFromFile();
    
    // Perform initial cleanup if limits are configured
    if (this.maxMemoryDb > 0 || this.maxItemAge > 0) {
      this.cleanup();
    }
  }

  private validateSessionID(sessionID: string): void {
    if (!sessionID || typeof sessionID !== 'string') {
      throw new Error('Session ID cannot be empty');
    }
  }

  private validateMessage(message: TMessage): void {
    const messageSize = JSON.stringify(message).length;
    if (messageSize > this.maxMessageSize) {
      throw new Error(`Message exceeds maximum size of ${this.maxMessageSize} bytes`);
    }
  }

  addMessage(sessionID: string, message: TMessage): void {
    this.validateSessionID(sessionID);
    this.validateMessage(message);

    // Check if this is a new session for event emission
    const isNewSession = !this.messages.some(m => m.session_id === sessionID);
    
    const storedMessage: Omit<StoredMessage, 'message'> & { message: TMessage } = {
      timestamp: new Date().toISOString(),
      session_id: sessionID,
      query_id: '', // Legacy method without query_id
      message,
      sequence: this.messages.length + 1
    };
    
    this.messages.push(storedMessage);
    this.cleanup();
    this.saveToFile();
    
    // Emit events for streaming
    if (isNewSession) {
      this.emitSessionCreated(sessionID);
    }
    this.eventEmitter.emit(`message:${sessionID}`, message);
  }

  addMessages(sessionID: string, messages: TMessage[]): void {
    this.validateSessionID(sessionID);
    
    for (const message of messages) {
      this.validateMessage(message);
    }

    // Check if this is a new session for event emission
    const isNewSession = !this.messages.some(m => m.session_id === sessionID);

    const timestamp = new Date().toISOString();
    const storedMessages = messages.map((msg, index) => ({
      timestamp,
      session_id: sessionID,
      query_id: '', // Legacy method without query_id
      message: msg,
      sequence: this.messages.length + index + 1
    }));
    
    this.messages.push(...storedMessages);
    this.cleanup();
    this.saveToFile();
    
    // Emit events for streaming
    if (isNewSession) {
      this.emitSessionCreated(sessionID);
    }
    for (const message of messages) {
      this.eventEmitter.emit(`message:${sessionID}`, message);
    }
  }

  addMessagesWithMetadata(sessionID: string, queryID: string, messages: TMessage[]): void {
    this.validateSessionID(sessionID);
    
    if (!queryID) {
      throw new Error('Query ID cannot be empty');
    }
    
    for (const message of messages) {
      this.validateMessage(message);
    }

    // Check if this is a new session for event emission
    const isNewSession = !this.messages.some(m => m.session_id === sessionID);

    const timestamp = new Date().toISOString();
    const storedMessages = messages.map((msg, index) => ({
      timestamp,
      session_id: sessionID,
      query_id: queryID,
      message: msg,
      sequence: this.messages.length + index + 1
    }));
    
    this.messages.push(...storedMessages);
    this.cleanup();
    this.saveToFile();
    
    // Emit events for streaming
    if (isNewSession) {
      this.emitSessionCreated(sessionID);
    }
    for (const message of messages) {
      this.eventEmitter.emit(`message:${sessionID}`, message);
    }
  }

  getMessages(sessionID: string): TMessage[] {
    this.validateSessionID(sessionID);
    // Return just the message content for backward compatibility
    return this.messages
      .filter(m => m.session_id === sessionID)
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

  getMessagesWithMetadata(sessionID: string, queryID?: string): Array<Omit<StoredMessage, 'message'> & { message: TMessage }> {
    this.validateSessionID(sessionID);
    let filtered = this.messages.filter(m => m.session_id === sessionID);
    if (queryID) {
      filtered = filtered.filter(m => m.query_id === queryID);
    }
    return filtered;
  }

  clearSession(sessionID: string): void {
    this.validateSessionID(sessionID);
    this.messages = this.messages.filter(m => m.session_id !== sessionID);
    this.saveToFile();
  }

  clearQuery(sessionID: string, queryID: string): void {
    this.validateSessionID(sessionID);
    if (!queryID) {
      throw new Error('Query ID cannot be empty');
    }
    this.messages = this.messages.filter(m => !(m.session_id === sessionID && m.query_id === queryID));
    this.saveToFile();
  }

  getSessions(): string[] {
    // Get unique session IDs from the flat list
    const sessionSet = new Set(this.messages.map(m => m.session_id));
    return Array.from(sessionSet);
  }

  getAllSessions(): string[] {
    // Alias for getSessions() for clarity
    return this.getSessions();
  }

  getAllMessages(): Array<Omit<StoredMessage, 'message'> & { message: TMessage }> {
    // Return all messages from the flat list
    return this.messages;
  }

  getStats(): { sessions: number; totalMessages: number } {
    const uniqueSessions = new Set(this.messages.map(m => m.session_id));
    
    return {
      sessions: uniqueSessions.size,
      totalMessages: this.messages.length
    };
  }

  isHealthy(): boolean {
    return true;
  }

  purge(): void {
    this.messages = [];
    this.saveToFile();
    console.log('[MEMORY PURGE] Cleared all messages');
  }

  private cleanup(): void {
    const initialCount = this.messages.length;
    if (initialCount === 0) {
      return;
    }

    let removedCount = 0;
    let needsSequenceUpdate = false;

    // Remove old messages based on age
    if (this.maxItemAge > 0) {
      const now = Date.now();
      const maxAgeMs = this.maxItemAge * 1000;
      const beforeAge = this.messages.length;
      this.messages = this.messages.filter(msg => {
        const messageAge = now - new Date(msg.timestamp).getTime();
        return messageAge <= maxAgeMs;
      });
      removedCount = beforeAge - this.messages.length;
      if (removedCount > 0) {
        console.log(`[MEMORY CLEANUP] Removed ${removedCount} messages older than ${this.maxItemAge} seconds`);
        needsSequenceUpdate = true;
      }
    }

    // Limit total number of messages (keep most recent)
    if (this.maxMemoryDb > 0 && this.messages.length > this.maxMemoryDb) {
      const beforeLimit = this.messages.length;
      // Sort by timestamp (oldest first) and keep only the most recent
      this.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      this.messages = this.messages.slice(-this.maxMemoryDb);
      const removedByLimit = beforeLimit - this.messages.length;
      if (removedByLimit > 0) {
        console.log(`[MEMORY CLEANUP] Removed ${removedByLimit} messages to stay within limit of ${this.maxMemoryDb}`);
        needsSequenceUpdate = true;
      }
    }

    // Update sequence numbers after cleanup to ensure sequential ordering
    if (needsSequenceUpdate || this.messages.length < initialCount) {
      // Sort by timestamp to maintain chronological order, then assign sequential numbers
      this.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      this.messages.forEach((msg, index) => {
        msg.sequence = index + 1;
      });
    }
  }

  private loadFromFile(): void {
    if (!this.memoryFilePath) {
      console.log('[MEMORY LOAD] File persistence disabled - memory will not be saved');
      return;
    }
    
    try {
      if (existsSync(this.memoryFilePath)) {
        const data = readFileSync(this.memoryFilePath, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (Array.isArray(parsed)) {
          this.messages = parsed as Array<Omit<StoredMessage, 'message'> & { message: TMessage }>;
          const sessions = new Set(this.messages.map(m => m.session_id)).size;
          console.log(`[MEMORY LOAD] Loaded ${this.messages.length} messages from ${sessions} sessions from ${this.memoryFilePath}`);
        } else {
          console.warn('Invalid data format in memory file, starting fresh');
        }
      } else {
        console.log(`[MEMORY LOAD] Memory file not found at ${this.memoryFilePath}, starting with 0 messages`);
      }
    } catch (error) {
      console.error(`[MEMORY LOAD] Failed to load memory from file: ${error}`);
    }
  }

  private saveToFile(): void {
    if (!this.memoryFilePath) return;
    
    try {
      const dir = dirname(this.memoryFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      writeFileSync(this.memoryFilePath, JSON.stringify(this.messages, null, 2), 'utf-8');
      const sessions = new Set(this.messages.map(m => m.session_id)).size;
      console.log(`[MEMORY SAVE] Saved ${this.messages.length} messages from ${sessions} sessions to ${this.memoryFilePath}`);
    } catch (error) {
      console.error(`[MEMORY SAVE] Failed to save memory to file: ${error}`);
    }
  }

  saveMemory(): void {
    if (!this.memoryFilePath) {
      console.log('[MEMORY SAVE] File persistence disabled - memory not saved');
      return;
    }
    this.saveToFile();
  }

  // Streaming support methods
  sessionExists(sessionID: string): boolean {
    return this.messages.some(m => m.session_id === sessionID);
  }

  subscribe(sessionID: string, callback: (message: TMessage) => void): () => void {
    this.eventEmitter.on(`message:${sessionID}`, callback);
    return () => {
      this.eventEmitter.off(`message:${sessionID}`, callback);
    };
  }

  subscribeToMessages(sessionID: string, callback: (chunk: TMessage) => void): () => void {
    this.eventEmitter.on(`chunk:${sessionID}`, callback);
    return () => {
      this.eventEmitter.off(`chunk:${sessionID}`, callback);
    };
  }

  waitForSession(sessionID: string, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.sessionExists(sessionID)) {
        resolve(true);
        return;
      }

      const timer = setTimeout(() => {
        this.eventEmitter.off(`session:${sessionID}:created`, onCreated);
        resolve(false);
      }, timeout);

      const onCreated = () => {
        clearTimeout(timer);
        resolve(true);
      };

      this.eventEmitter.once(`session:${sessionID}:created`, onCreated);
    });
  }

  private emitSessionCreated(sessionID: string): void {
    this.eventEmitter.emit(`session:${sessionID}:created`);
  }

}