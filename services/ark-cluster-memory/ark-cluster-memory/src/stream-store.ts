import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export class StreamStore {
  private streamChunks: Map<string, any[]> = new Map();
  private completedStreams: Set<string> = new Set();
  private readonly streamFilePath?: string;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    this.streamFilePath = process.env.STREAM_FILE_PATH;
    this.loadFromFile();
  }

  addStreamChunk(queryID: string, chunk: any): void {
    if (!this.streamChunks.has(queryID)) {
      this.streamChunks.set(queryID, []);
    }
    this.streamChunks.get(queryID)!.push(chunk);
  }

  getStreamChunks(queryID: string): any[] {
    return this.streamChunks.get(queryID) || [];
  }

  getAllStreams(): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    for (const [key, value] of this.streamChunks.entries()) {
      result[key] = value;
    }
    return result;
  }

  completeQueryStream(queryID: string): void {
    // Mark query as complete
    this.completedStreams.add(queryID);
    // Add a [DONE] marker to the chunks
    this.addStreamChunk(queryID, '[DONE]');
    // Notify any active listeners
    this.eventEmitter.emit(`complete:${queryID}`);
    // Save to file
    this.saveToFile();
  }
  
  isStreamComplete(queryID: string): boolean {
    return this.completedStreams.has(queryID);
  }

  hasStream(queryID: string): boolean {
    return this.streamChunks.has(queryID);
  }

  subscribeToChunks(queryID: string, callback: (chunk: any) => void): () => void {
    const listener = (chunk: any) => callback(chunk);
    this.eventEmitter.on(`chunk:${queryID}`, listener);
    return () => this.eventEmitter.off(`chunk:${queryID}`, listener);
  }

  purge(): void {
    this.streamChunks.clear();
    this.completedStreams.clear();
    this.saveToFile();
    console.log('[STREAM PURGE] Cleared all stream chunks and completion states');
  }

  private loadFromFile(): void {
    if (!this.streamFilePath) {
      console.log('[STREAM LOAD] File persistence disabled - streams will not be saved');
      return;
    }

    try {
      if (existsSync(this.streamFilePath)) {
        const data = readFileSync(this.streamFilePath, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (parsed && typeof parsed === 'object') {
          // Load stream chunks
          if (parsed.streams) {
            this.streamChunks = new Map(Object.entries(parsed.streams));
          }
          // Load completed streams
          if (parsed.completed && Array.isArray(parsed.completed)) {
            this.completedStreams = new Set(parsed.completed);
          }
          console.log(`[STREAM LOAD] Loaded ${this.streamChunks.size} query streams (${this.completedStreams.size} completed) from ${this.streamFilePath}`);
        } else {
          console.warn('[STREAM LOAD] Invalid data format in stream file, starting fresh');
        }
      } else {
        console.log(`[STREAM LOAD] Stream file not found at ${this.streamFilePath}, starting with 0 streams`);
      }
    } catch (error) {
      console.error(`[STREAM LOAD] Failed to load streams from file: ${error}`);
    }
  }

  private saveToFile(): void {
    if (!this.streamFilePath) return;

    try {
      const dir = dirname(this.streamFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Convert Map and Set to plain objects for JSON serialization
      const dataToSave = {
        streams: Object.fromEntries(this.streamChunks),
        completed: Array.from(this.completedStreams)
      };
      writeFileSync(this.streamFilePath, JSON.stringify(dataToSave, null, 2));
      console.log(`[STREAM SAVE] Saved ${this.streamChunks.size} query streams (${this.completedStreams.size} completed) to ${this.streamFilePath}`);
    } catch (error) {
      console.error(`[STREAM SAVE] Failed to save streams to file: ${error}`);
    }
  }

  public saveStreams(): void {
    this.saveToFile();
  }
}