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

const MAX_SWEEP_INTERVAL_MS = 60_000;

// The store is bounded by bytes and by age (TTL).
export interface InMemoryStreamOptions {
  path?: string;
  maxBytes?: number;
  ttlSeconds?: number;
}

export class InMemoryStream<T> implements Stream<T> {
  private items: BrokerItem<T>[] = [];
  private nextSequence = 1;
  private readonly maxBytes?: number;
  private readonly ttlMs?: number;
  private readonly sizes = new Map<number, number>();
  private sweepTimer?: ReturnType<typeof setInterval>;
  private fileStore: JsonFileStore<BrokerItem<T>>;
  private readonly eventEmitter = new EventEmitter();

  constructor(
    private readonly logger: Logger,
    name: string,
    opts: InMemoryStreamOptions = {}
  ) {
    this.maxBytes = opts.maxBytes;
    this.ttlMs =
      opts.ttlSeconds && opts.ttlSeconds > 0
        ? opts.ttlSeconds * 1000
        : undefined;
    this.fileStore = new JsonFileStore<BrokerItem<T>>(logger, name, opts.path);
  }

  // Load persisted items in memory bounded by maxBytes, then re-compact the
  // file to the retained set, then start the maintenance sweep. Loading here
  // (not in the constructor) keeps it async so an oversized file streams
  // instead of being read whole. Idempotent.
  async init(): Promise<void> {
    const loaded = await this.fileStore.loadBounded({maxBytes: this.maxBytes});
    if (loaded) {
      for (const raw of loaded.items) {
        if (typeof raw?.sequenceNumber !== 'number') continue;
        this.items.push({
          ...raw,
          timestamp: new Date(raw.timestamp as unknown as string),
        });
      }
      this.nextSequence = loaded.nextSequence;
      this.maintain();
      await this.save();
    }
    if ((this.ttlMs || this.maxBytes) && !this.sweepTimer) {
      const interval = this.ttlMs
        ? Math.min(this.ttlMs, MAX_SWEEP_INTERVAL_MS)
        : MAX_SWEEP_INTERVAL_MS;
      this.sweepTimer = setInterval(() => this.maintain(), interval);
      this.sweepTimer.unref?.();
    }
  }

  close(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  // Hot path: no serialization and no eviction. Stamp expiry and push; byte and
  // age enforcement are deferred to maintain() so the POST /events path (which
  // holds the controller emitter's semaphore) stays serialize-free.
  async append(data: T, ttlSeconds?: number): Promise<BrokerItem<T>> {
    const ttlMs = ttlSeconds && ttlSeconds > 0 ? ttlSeconds * 1000 : this.ttlMs;
    const item: BrokerItem<T> = {
      sequenceNumber: this.nextSequence++,
      timestamp: new Date(),
      ...(ttlMs ? {expiresAt: Date.now() + ttlMs} : {}),
      data,
    };
    this.items.push(item);
    this.eventEmitter.emit('item', item);
    return item;
  }

  async all(): Promise<BrokerItem<T>[]> {
    return this.live();
  }

  cachedItemCount(): number {
    return this.items.length;
  }

  async filter(predicate: Predicate<T>): Promise<BrokerItem<T>[]> {
    return this.live().filter(predicate);
  }

  async save(): Promise<void> {
    await this.fileStore.save(this.items, this.nextSequence);
  }

  // Enforce age (TTL) then the byte budget, evicting oldest first. Public so
  // callers and tests can force a deterministic pass; the timer calls it with
  // the wall clock. Each item is sized at most once (memoized), and only when a
  // byte budget is set — so this is the single place serialization can happen,
  // and never on the append hot path.
  maintain(now: number = Date.now()): void {
    this.evictExpired(now);
    this.evictOverByteBudget();
  }

  async delete(predicate?: Predicate<T>): Promise<void> {
    if (predicate) {
      const survivors: BrokerItem<T>[] = [];
      for (const item of this.items) {
        if (predicate(item)) {
          this.sizes.delete(item.sequenceNumber);
        } else {
          survivors.push(item);
        }
      }
      this.items = survivors;
    } else {
      this.items = [];
      this.sizes.clear();
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

    let filtered = predicate ? this.live().filter(predicate) : this.live();
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

  private live(): BrokerItem<T>[] {
    if (!this.ttlMs) return this.items;
    const now = Date.now();
    return this.items.filter((item) => !this.isExpired(item, now));
  }

  private isExpired(item: BrokerItem<T>, now: number): boolean {
    return item.expiresAt !== undefined && item.expiresAt <= now;
  }

  private evictExpired(now: number): void {
    if (!this.ttlMs) return;
    if (!this.items.some((item) => this.isExpired(item, now))) return;
    const survivors: BrokerItem<T>[] = [];
    for (const item of this.items) {
      if (this.isExpired(item, now)) {
        this.sizes.delete(item.sequenceNumber);
      } else {
        survivors.push(item);
      }
    }
    this.items = survivors;
  }

  private evictOverByteBudget(): void {
    if (this.maxBytes === undefined) return;
    let total = 0;
    for (const item of this.items) total += this.sizeOf(item);
    while (total > this.maxBytes && this.items.length > 1) {
      const removed = this.items.shift()!;
      total -= this.sizes.get(removed.sequenceNumber) ?? 0;
      this.sizes.delete(removed.sequenceNumber);
    }
  }

  private sizeOf(item: BrokerItem<T>): number {
    const cached = this.sizes.get(item.sequenceNumber);
    if (cached !== undefined) return cached;
    const size = Buffer.byteLength(JSON.stringify(item));
    this.sizes.set(item.sequenceNumber, size);
    return size;
  }
}
