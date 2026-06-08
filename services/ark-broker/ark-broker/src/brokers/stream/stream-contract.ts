import type {Stream} from './stream.js';
import type {BrokerItem} from './broker-item.js';

export function runStreamContract<T>(
  factory: () => Stream<T>,
  makeData: (label: string) => T
): void {
  let stream: Stream<T>;

  beforeEach(() => {
    stream = factory();
  });

  describe('append', () => {
    it('assigns sequenceNumber starting at 1', async () => {
      const item = await stream.append(makeData('a'));
      expect(item.sequenceNumber).toBe(1);
    });

    it('increments sequenceNumber monotonically', async () => {
      const a = await stream.append(makeData('a'));
      const b = await stream.append(makeData('b'));
      const c = await stream.append(makeData('c'));
      expect(a.sequenceNumber).toBe(1);
      expect(b.sequenceNumber).toBe(2);
      expect(c.sequenceNumber).toBe(3);
    });

    it('returns item with timestamp as Date', async () => {
      const item = await stream.append(makeData('a'));
      expect(item.timestamp).toBeInstanceOf(Date);
    });

    it('fires subscribe callback synchronously during append', async () => {
      const received: T[] = [];
      stream.subscribe((item: BrokerItem<T>) => received.push(item.data));
      const appendPromise = stream.append(makeData('x'));
      expect(received).toHaveLength(1);
      await appendPromise;
      expect(received).toHaveLength(1);
    });
  });

  describe('all', () => {
    it('returns empty array initially', async () => {
      expect(await stream.all()).toEqual([]);
    });

    it('returns all appended items in order', async () => {
      await stream.append(makeData('a'));
      await stream.append(makeData('b'));
      const all = await stream.all();
      expect(all).toHaveLength(2);
      expect(all[0].sequenceNumber).toBe(1);
      expect(all[1].sequenceNumber).toBe(2);
    });
  });

  describe('filter', () => {
    it('returns only matching items', async () => {
      const a = await stream.append(makeData('a'));
      await stream.append(makeData('b'));
      const result = await stream.filter(
        (item: BrokerItem<T>) => item.sequenceNumber === a.sequenceNumber
      );
      expect(result).toHaveLength(1);
      expect(result[0].sequenceNumber).toBe(a.sequenceNumber);
    });

    it('returns empty array when nothing matches', async () => {
      await stream.append(makeData('a'));
      const result = await stream.filter((_item: BrokerItem<T>) => false);
      expect(result).toHaveLength(0);
    });
  });

  describe('paginate', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await stream.append(makeData(`item-${i}`));
      }
    });

    it('returns up to limit items', async () => {
      const result = await stream.paginate({limit: 2});
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(2);
    });

    it('applies cursor to skip already-seen items', async () => {
      const result = await stream.paginate({limit: 2, cursor: 2});
      expect(result.items).toHaveLength(2);
      expect(result.items[0].sequenceNumber).toBe(3);
    });

    it('sets hasMore=false and nextCursor=undefined on last page', async () => {
      const result = await stream.paginate({limit: 10});
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('applies predicate before pagination', async () => {
      const result = await stream.paginate(
        {limit: 10},
        (item: BrokerItem<T>) => item.sequenceNumber % 2 === 1
      );
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });
  });

  describe('delete', () => {
    it('removes all items and resets sequence when called without predicate', async () => {
      await stream.append(makeData('a'));
      await stream.append(makeData('b'));
      await stream.delete();
      expect(await stream.all()).toHaveLength(0);
      const next = await stream.append(makeData('c'));
      expect(next.sequenceNumber).toBe(1);
    });

    it('removes only matching items when predicate is provided', async () => {
      const a = await stream.append(makeData('a'));
      await stream.append(makeData('b'));
      await stream.delete(
        (item: BrokerItem<T>) => item.sequenceNumber === a.sequenceNumber
      );
      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0].sequenceNumber).toBe(2);
    });

    it('does not reset sequence when using predicate', async () => {
      const a = await stream.append(makeData('a'));
      await stream.delete(
        (item: BrokerItem<T>) => item.sequenceNumber === a.sequenceNumber
      );
      const next = await stream.append(makeData('b'));
      expect(next.sequenceNumber).toBe(2);
    });
  });

  describe('getCurrentSequence', () => {
    it('returns 0 when stream is empty', async () => {
      expect(await stream.getCurrentSequence()).toBe(0);
    });

    it('returns last assigned sequence number', async () => {
      await stream.append(makeData('a'));
      await stream.append(makeData('b'));
      expect(await stream.getCurrentSequence()).toBe(2);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('notifies subscriber for each append', async () => {
      const seqs: number[] = [];
      stream.subscribe((item: BrokerItem<T>) => seqs.push(item.sequenceNumber));
      await stream.append(makeData('a'));
      await stream.append(makeData('b'));
      expect(seqs).toEqual([1, 2]);
    });

    it('stops notifying after returned unsubscribe is called', async () => {
      const seqs: number[] = [];
      const unsubscribe = stream.subscribe((item: BrokerItem<T>) =>
        seqs.push(item.sequenceNumber)
      );
      await stream.append(makeData('a'));
      unsubscribe();
      await stream.append(makeData('b'));
      expect(seqs).toEqual([1]);
    });

    it('multiple subscribers all receive events', async () => {
      const a: number[] = [];
      const b: number[] = [];
      stream.subscribe((item: BrokerItem<T>) => a.push(item.sequenceNumber));
      stream.subscribe((item: BrokerItem<T>) => b.push(item.sequenceNumber));
      await stream.append(makeData('x'));
      expect(a).toEqual([1]);
      expect(b).toEqual([1]);
    });
  });
}
