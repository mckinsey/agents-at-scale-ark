import { EventEmitter } from 'events';
import { JsonFileStore } from './json-file-store';

interface StoredChunk {
  queryID: string;
  chunk: any;
  complete?: boolean;
}

export class StreamStore {
  private chunks: StoredChunk[] = [];
  private fileStore: JsonFileStore<StoredChunk[]>;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    const maxChunks = process.env.MAX_CHUNKS ? parseInt(process.env.MAX_CHUNKS, 10) : 0;
    this.fileStore = new JsonFileStore<StoredChunk[]>(
      'Stream',
      process.env.STREAM_FILE_PATH,
      (d) => d.length,
      maxChunks
    );
    this.chunks = this.fileStore.load() ?? [];
  }

  addStreamChunk(queryID: string, chunk: any): void {
    if (!this.streamChunks.has(queryID)) {
      this.streamChunks.set(queryID, []);
    }
    this.streamChunks.get(queryID)!.push(chunk);
    this.eventEmitter.emit(`chunk:${queryID}`, chunk);
    this.eventEmitter.emit('chunk:*', { queryID, chunk });
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
    this.completedStreams.add(queryID);
    this.addStreamChunk(queryID, '[DONE]');
    this.eventEmitter.emit(`complete:${queryID}`);
    this.save();
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

  subscribeToAllChunks(callback: (data: { queryID: string; chunk: any }) => void): () => void {
    const listener = (data: { queryID: string; chunk: any }) => callback(data);
    this.eventEmitter.on('chunk:*', listener);
    return () => this.eventEmitter.off('chunk:*', listener);
  }

  purge(): void {
    this.streamChunks.clear();
    this.completedStreams.clear();
    this.save();
    console.log('[Stream] purged');
  }

  save(): void {
    this.applyLimit();
    this.fileStore.save({
      streams: Object.fromEntries(this.streamChunks),
      completed: Array.from(this.completedStreams)
    });
  }
}
