import type {BrokerItem} from './broker-item.js';
import type {
  PaginatedList,
  PaginationParams,
} from '@ark-broker/brokers/pagination.js';

export type Predicate<T> = (item: BrokerItem<T>) => boolean;

export function hasScopingField(filter: Record<string, unknown>): boolean {
  return Object.entries(filter).some(
    ([key, value]) => key !== 'afterSequence' && Boolean(value)
  );
}

export interface Stream<T> {
  append(data: T, ttlSeconds?: number): Promise<BrokerItem<T>>;
  all(): Promise<BrokerItem<T>[]>;
  filter(predicate: Predicate<T>): Promise<BrokerItem<T>[]>;
  paginate(
    params: PaginationParams,
    predicate?: Predicate<T>
  ): Promise<PaginatedList<BrokerItem<T>>>;
  delete(predicate?: Predicate<T>): Promise<void>;
  save(): Promise<void>;
  getCurrentSequence(): Promise<number>;
  subscribe(callback: (item: BrokerItem<T>) => void): () => void;
}
