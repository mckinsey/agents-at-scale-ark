import { Message, StoredMessage } from './types.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { EventEmitter } from 'events';

export class MemoryStore {
  // Flat list of all messages with metadata
  private messages: StoredMessage[] = [];
  private readonly maxMessageSize: number;
  private readonly memoryFilePath?: string;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor(maxMessageSize?: number) {
    // Use MAX_MESSAGE_SIZE_MB env var or default to 10MB
    const maxSizeMB = process.env.MAX_MESSAGE_SIZE_MB ? parseInt(process.env.MAX_MESSAGE_SIZE_MB, 10) : 10;
    this.maxMessageSize = maxMessageSize ?? (maxSizeMB * 1024 * 1024);
    this.memoryFilePath = process.env.MEMORY_FILE_PATH;

    this.loadFromFile();
  }

  private validateSessionID(sessionID: string): void {
    if (!sessionID || typeof sessionID !== 'string') {
      throw new Error('Session ID cannot be empty');
    }
  }

  private validateMessage(message: Message): void {
    const messageSize = JSON.stringify(message).length;
    if (messageSize > this.maxMessageSize) {
      throw new Error(`Message exceeds maximum size of ${this.maxMessageSize} bytes`);
    }
  }

  addMessage(sessionID: string, message: Message): void {
    this.validateSessionID(sessionID);
    this.validateMessage(message);

    // Check if this is a new session for event emission
    const isNewSession = !this.messages.some(m => m.session_id === sessionID);
    
    const storedMessage: StoredMessage = {
      timestamp: new Date().toISOString(),
      session_id: sessionID,
      query_id: '', // Legacy method without query_id
      message
    };
    
    this.messages.push(storedMessage);
    this.saveToFile();
    
    // Emit events for streaming
    if (isNewSession) {
      this.emitSessionCreated(sessionID);
    }
    this.eventEmitter.emit(`message:${sessionID}`, message);
  }

  addMessages(sessionID: string, messages: Message[]): void {
    this.validateSessionID(sessionID);
    
    for (const message of messages) {
      this.validateMessage(message);
    }

    // Check if this is a new session for event emission
    const isNewSession = !this.messages.some(m => m.session_id === sessionID);

    const timestamp = new Date().toISOString();
    const storedMessages = messages.map(msg => ({
      timestamp,
      session_id: sessionID,
      query_id: '', // Legacy method without query_id
      message: msg
    }));
    
    this.messages.push(...storedMessages);
    this.saveToFile();
    
    // Emit events for streaming
    if (isNewSession) {
      this.emitSessionCreated(sessionID);
    }
    for (const message of messages) {
      this.eventEmitter.emit(`message:${sessionID}`, message);
    }
  }

  addMessagesWithMetadata(sessionID: string, queryID: string, messages: Message[]): void {
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
    const storedMessages = messages.map(msg => ({
      timestamp,
      session_id: sessionID,
      query_id: queryID,
      message: msg
    }));
    
    this.messages.push(...storedMessages);
    this.saveToFile();
    
    // Emit events for streaming
    if (isNewSession) {
      this.emitSessionCreated(sessionID);
    }
    for (const message of messages) {
      this.eventEmitter.emit(`message:${sessionID}`, message);
    }
  }

  getMessages(sessionID: string): Message[] {
    this.validateSessionID(sessionID);
    // Return just the message content for backward compatibility
    return this.messages
      .filter(m => m.session_id === sessionID)
      .map(m => m.message);
  }

  getMessagesByQuery(queryID: string): Message[] {
    if (!queryID) {
      throw new Error('Query ID cannot be empty');
    }
    // Return messages filtered by query_id
    return this.messages
      .filter(m => m.query_id === queryID)
      .map(m => m.message);
  }

  getMessagesWithMetadata(sessionID: string, queryID?: string): StoredMessage[] {
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

  getSessions(): string[] {
    // Get unique session IDs from the flat list
    const sessionSet = new Set(this.messages.map(m => m.session_id));
    return Array.from(sessionSet);
  }

  getAllSessions(): string[] {
    // Alias for getSessions() for clarity
    return this.getSessions();
  }

  getAllMessages(): StoredMessage[] {
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
          this.messages = parsed;
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

  subscribe(sessionID: string, callback: (message: Message) => void): () => void {
    this.eventEmitter.on(`message:${sessionID}`, callback);
    return () => {
      this.eventEmitter.off(`message:${sessionID}`, callback);
    };
  }

  subscribeToMessages(sessionID: string, callback: (chunk: Message) => void): () => void {
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