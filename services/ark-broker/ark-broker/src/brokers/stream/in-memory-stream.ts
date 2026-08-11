import {EventEmitter} from 'events';
import {BrokerItem} from './broker-item.js';
import {JsonFileStore} from '@ark-broker/brokers/persistence/json-file-store.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import {
  PaginatedList,
  PaginationParams,
  DEFAULT_LIMIT,
} from '@ark-broker/brokers/pagination.js';
import type {Stream, Predicate} from './stream.js';

export class InMemoryStream<T> implements Stream<T> {
  private items: BrokerItem<T>[] = [];
  private nextSequence = 1;
  private maxItems?: number;
  private fileStore: JsonFileStore<BrokerItem<T>>;
  private readonly eventEmitter = new EventEmitter();

  constructor(
    private readonly logger: Logger,
    name: string,
    path?: string,
    maxItems?: number
  ) {
    this.maxItems = maxItems;
    this.fileStore = new JsonFileStore<BrokerItem<T>>(
      logger,
      name,
      path,
      maxItems
    );
    const loaded = this.fileStore.load();
    if (loaded) {
      if (
        !Array.isArray(loaded.items) ||
        typeof loaded.nextSequence !== 'number'
      ) {
        this.logger.warn(
          'data file has invalid structure or data, no data loaded'
        );
      } else {
        this.items = loaded.items.map((item) => ({
          ...item,
          timestamp: new Date(item.timestamp as unknown as string),
        }));
        this.nextSequence = loaded.nextSequence;
      }
    }
  }

  async append(data: T, _ttlSeconds?: number): Promise<BrokerItem<T>> {
    const item: BrokerItem<T> = {
      sequenceNumber: this.nextSequence++,
      timestamp: new Date(),
      data,
    };
    this.items.push(item);
    if (this.maxItems && this.items.length > this.maxItems) {
      this.items = this.items.slice(-this.maxItems);
    }
    this.eventEmitter.emit('item', item);
    return item;
  }

  async all(): Promise<BrokerItem<T>[]> {
    return this.items;
  }

  async filter(predicate: Predicate<T>): Promise<BrokerItem<T>[]> {
    return this.items.filter(predicate);
  }

  async save(): Promise<void> {
    this.fileStore.save(this.items, this.nextSequence);
  }

  async delete(predicate?: Predicate<T>): Promise<void> {
    if (predicate) {
      this.items = this.items.filter((item) => !predicate(item));
    } else {
      this.items = [];
      this.nextSequence = 1;
    }
    await this.save();
  }

  subscribe(callback: (item: BrokerItem<T>) => void): () => void {
    this.eventEmitter.on('item', callback);
    return () => this.eventEmitter.off('item', callback);
  }

  async paginate(
    params: PaginationParams,
    predicate?: Predicate<T>
  ): Promise<PaginatedList<BrokerItem<T>>> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const cursor = params.cursor;

    let filtered = predicate ? this.items.filter(predicate) : this.items;
    const total = filtered.length;

    if (cursor !== undefined) {
      filtered = filtered.filter((item) => item.sequenceNumber > cursor);
    }

    const items = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor =
      items.length > 0 ? items.at(-1)!.sequenceNumber : undefined;

    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore ? nextCursor : undefined,
    };
  }

  async getCurrentSequence(): Promise<number> {
    return this.nextSequence - 1;
  }
}
