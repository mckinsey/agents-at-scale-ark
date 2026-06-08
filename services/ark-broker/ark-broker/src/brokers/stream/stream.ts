import {BrokerItem} from './broker-item.js';
import {PaginatedList, PaginationParams} from '../pagination.js';

/**
 * Predicate function for filtering broker items.
 * @template T - The type of data stored in the broker item
 */
export type Predicate<T> = (item: BrokerItem<T>) => boolean;

/**
 * Async-first append-only stream interface for broker storage.
 *
 * All storage operations (append, filter, paginate, delete, save) are asynchronous
 * to support future durable backends (Postgres, Redis, etc.). The subscribe method
 * remains synchronous as it's EventEmitter-based.
 *
 * @template T - The type of data being stored in each item
 */
export interface Stream<T> {
  /**
   * Append a new item to the stream.
   * Returns the created BrokerItem with sequence number and timestamp.
   * Synchronously emits an 'item' event to subscribers.
   */
  append(data: T): Promise<BrokerItem<T>>;

  /**
   * Get all items in the stream.
   */
  all(): Promise<BrokerItem<T>[]>;

  /**
   * Filter items by a predicate function.
   */
  filter(predicate: Predicate<T>): Promise<BrokerItem<T>[]>;

  /**
   * Get a paginated slice of items.
   * @param params - Pagination parameters (limit and optional cursor)
   * @param predicate - Optional filter to apply before pagination
   */
  paginate(
    params: PaginationParams,
    predicate?: Predicate<T>
  ): Promise<PaginatedList<BrokerItem<T>>>;

  /**
   * Delete items matching the predicate, or all items if no predicate provided.
   * Resets sequence to 1 if all items deleted.
   */
  delete(predicate?: Predicate<T>): Promise<void>;

  /**
   * Persist the current stream state to storage (if persistence is enabled).
   */
  save(): Promise<void>;

  /**
   * Get the current highest sequence number.
   * Useful for starting a watch stream from the current position.
   */
  getCurrentSequence(): Promise<number>;

  /**
   * Subscribe to new items being appended to the stream.
   * The callback is invoked synchronously when items are appended.
   * @returns Unsubscribe function
   */
  subscribe(callback: (item: BrokerItem<T>) => void): () => void;
}
