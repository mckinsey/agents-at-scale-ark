import { EventEmitter } from 'events';
import { BrokerItem } from './broker-item.js';
import { JsonFileStore } from './json-file-store.js';
import { PaginatedList, PaginationParams, DEFAULT_LIMIT } from './pagination.js';

/**
 * An append-only stream of broker items with persistence support.
 * Provides sequencing, timestamping, filtering, and optional file-based storage.
 *
 * @template T - The type of data being stored in each item
 */
export class BrokerItemStream<T> {
  private items: BrokerItem<T>[] = [];
  private nextSequence = 1;
  private fileStore: JsonFileStore<BrokerItem<T>>;
  public eventEmitter = new EventEmitter();

  constructor(name: string, path?: string, maxItems?: number) {
    this.fileStore = new JsonFileStore<BrokerItem<T>>(name, path, maxItems);
    const loaded = this.fileStore.load();
    if (loaded) {
      if (!Array.isArray(loaded.items) || typeof loaded.nextSequence !== 'number') {
        console.warn(`[${name}] data file has invalid structure or data, no data loaded`);
      } else {
        this.items = loaded.items.map(item => ({
          ...item,
          timestamp: new Date(item.timestamp as unknown as string)
        }));
        this.nextSequence = loaded.nextSequence;
      }
    }
  }

  append(data: T): BrokerItem<T> {
    const item: BrokerItem<T> = {
      sequenceNumber: this.nextSequence++,
      timestamp: new Date(),
      data
    };
    this.items.push(item);
    this.eventEmitter.emit('item', item);
    return item;
  }

  all(): BrokerItem<T>[] {
    return this.items;
  }

  filter(predicate: (item: BrokerItem<T>) => boolean): BrokerItem<T>[] {
    return this.items.filter(predicate);
  }

  save(): void {
    this.fileStore.save(this.items, this.nextSequence);
  }

  delete(predicate?: (item: BrokerItem<T>) => boolean): void {
    if (predicate) {
      this.items = this.items.filter(item => !predicate(item));
    } else {
      this.items = [];
      this.nextSequence = 1;
    }
    this.save();
  }

  subscribe(callback: (item: BrokerItem<T>) => void): () => void {
    this.eventEmitter.on('item', callback);
    return () => this.eventEmitter.off('item', callback);
  }

  /**
   * Get a paginated slice of items.
   *
   * @param params - Pagination parameters (limit and optional cursor)
   * @param predicate - Optional filter to apply before pagination
   * @returns Paginated list with items, total count, and next cursor
   */
  paginate(
    params: PaginationParams,
    predicate?: (item: BrokerItem<T>) => boolean
  ): PaginatedList<BrokerItem<T>> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const cursor = params.cursor;

    let filtered = predicate ? this.items.filter(predicate) : this.items;
    const total = filtered.length;

    if (cursor !== undefined) {
      filtered = filtered.filter(item => item.sequenceNumber > cursor);
    }

    const items = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor = items.length > 0 ? items[items.length - 1].sequenceNumber : undefined;

    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore ? nextCursor : undefined
    };
  }

  /**
   * Get the current highest sequence number.
   * Useful for starting a watch stream from the current position.
   */
  getCurrentSequence(): number {
    return this.nextSequence - 1;
  }
}
