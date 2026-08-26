import {mkdtempSync, rmSync, statSync} from 'fs';
import {join} from 'path';
import {tmpdir} from 'os';
import {InMemoryStream} from '../in-memory-stream.js';
import {createLogger} from '@ark-broker/logging/logger.js';

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('InMemoryStream — Stream<T> contract', () => {
  let stream: InMemoryStream<string>;

  beforeEach(() => {
    stream = new InMemoryStream<string>(silentLogger, 'test');
  });

  describe('append', () => {
    it('assigns sequenceNumber starting at 1', async () => {
      const item = await stream.append('a');
      expect(item.sequenceNumber).toBe(1);
    });

    it('increments sequenceNumber monotonically', async () => {
      const a = await stream.append('a');
      const b = await stream.append('b');
      const c = await stream.append('c');
      expect(a.sequenceNumber).toBe(1);
      expect(b.sequenceNumber).toBe(2);
      expect(c.sequenceNumber).toBe(3);
    });

    it('returns item with timestamp as Date', async () => {
      const item = await stream.append('a');
      expect(item.timestamp).toBeInstanceOf(Date);
    });

    it('fires subscribe callback synchronously during append', async () => {
      const received: string[] = [];
      stream.subscribe((item) => received.push(item.data));
      const appendPromise = stream.append('x');
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
      await stream.append('a');
      await stream.append('b');
      const all = await stream.all();
      expect(all).toHaveLength(2);
      expect(all[0].sequenceNumber).toBe(1);
      expect(all[1].sequenceNumber).toBe(2);
    });
  });

  describe('filter', () => {
    it('returns only matching items', async () => {
      const a = await stream.append('a');
      await stream.append('b');
      const result = await stream.filter(
        (item) => item.sequenceNumber === a.sequenceNumber
      );
      expect(result).toHaveLength(1);
      expect(result[0].sequenceNumber).toBe(a.sequenceNumber);
    });

    it('returns empty array when nothing matches', async () => {
      await stream.append('a');
      expect(await stream.filter(() => false)).toHaveLength(0);
    });
  });

  describe('paginate', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await stream.append(`item-${i}`);
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
        (item) => item.sequenceNumber % 2 === 1
      );
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });
  });

  describe('delete', () => {
    it('removes all items and resets sequence when called without predicate', async () => {
      await stream.append('a');
      await stream.append('b');
      await stream.delete();
      expect(await stream.all()).toHaveLength(0);
      const next = await stream.append('c');
      expect(next.sequenceNumber).toBe(1);
    });

    it('removes only matching items when predicate is provided', async () => {
      const a = await stream.append('a');
      await stream.append('b');
      await stream.delete((item) => item.sequenceNumber === a.sequenceNumber);
      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0].sequenceNumber).toBe(2);
    });

    it('does not reset sequence when using predicate', async () => {
      const a = await stream.append('a');
      await stream.delete((item) => item.sequenceNumber === a.sequenceNumber);
      const next = await stream.append('b');
      expect(next.sequenceNumber).toBe(2);
    });
  });

  describe('getCurrentSequence', () => {
    it('returns 0 when stream is empty', async () => {
      expect(await stream.getCurrentSequence()).toBe(0);
    });

    it('returns last assigned sequence number', async () => {
      await stream.append('a');
      await stream.append('b');
      expect(await stream.getCurrentSequence()).toBe(2);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('notifies subscriber for each append', async () => {
      const seqs: number[] = [];
      stream.subscribe((item) => seqs.push(item.sequenceNumber));
      await stream.append('a');
      await stream.append('b');
      expect(seqs).toEqual([1, 2]);
    });

    it('stops notifying after returned unsubscribe is called', async () => {
      const seqs: number[] = [];
      const unsubscribe = stream.subscribe((item) =>
        seqs.push(item.sequenceNumber)
      );
      await stream.append('a');
      unsubscribe();
      await stream.append('b');
      expect(seqs).toEqual([1]);
    });

    it('multiple subscribers all receive events', async () => {
      const a: number[] = [];
      const b: number[] = [];
      stream.subscribe((item) => a.push(item.sequenceNumber));
      stream.subscribe((item) => b.push(item.sequenceNumber));
      await stream.append('x');
      expect(a).toEqual([1]);
      expect(b).toEqual([1]);
    });
  });
});

describe('InMemoryStream — persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'in-memory-stream-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, {recursive: true, force: true});
  });

  it('saves and reloads items with timestamps rehydrated as Date', async () => {
    const path = join(tmpDir, 'store.json');
    const stream = new InMemoryStream<string>(silentLogger, 'test', {path});

    await stream.append('hello');
    await stream.append('world');
    await stream.save();

    const reloaded = new InMemoryStream<string>(silentLogger, 'test', {path});
    await reloaded.init();
    const all = await reloaded.all();

    expect(all).toHaveLength(2);
    expect(all[0].data).toBe('hello');
    expect(all[1].data).toBe('world');
    expect(all[0].timestamp).toBeInstanceOf(Date);
    expect(all[1].timestamp).toBeInstanceOf(Date);
    expect(await reloaded.getCurrentSequence()).toBe(2);
  });

  it('resumes sequence numbering after reload', async () => {
    const path = join(tmpDir, 'store.json');
    const stream = new InMemoryStream<string>(silentLogger, 'test', {path});

    await stream.append('a');
    await stream.append('b');
    await stream.save();

    const reloaded = new InMemoryStream<string>(silentLogger, 'test', {path});
    await reloaded.init();
    const c = await reloaded.append('c');
    expect(c.sequenceNumber).toBe(3);
  });

  it('starts fresh when no file exists', async () => {
    const path = join(tmpDir, 'nonexistent.json');
    const stream = new InMemoryStream<string>(silentLogger, 'test', {path});
    await stream.init();
    expect(await stream.all()).toHaveLength(0);
    expect(await stream.getCurrentSequence()).toBe(0);
  });
});

describe('InMemoryStream — maxItems eviction', () => {
  it('retains only the most recent maxItems items', async () => {
    const stream = new InMemoryStream<string>(silentLogger, 'test', {
      maxItems: 3,
    });

    await stream.append('a');
    await stream.append('b');
    await stream.append('c');
    await stream.append('d');

    const all = await stream.all();
    expect(all).toHaveLength(3);
    expect(all.map((i) => i.data)).toEqual(['b', 'c', 'd']);
  });

  it('subscriber still fires for items that get evicted', async () => {
    const stream = new InMemoryStream<string>(silentLogger, 'test', {
      maxItems: 2,
    });
    const received: string[] = [];
    stream.subscribe((item) => received.push(item.data as string));

    await stream.append('a');
    await stream.append('b');
    await stream.append('c');

    expect(received).toEqual(['a', 'b', 'c']);
    expect((await stream.all()).map((i) => i.data)).toEqual(['b', 'c']);
  });
});

describe('InMemoryStream — TTL eviction', () => {
  it('evicts items past their ttl on maintain, regardless of completion', async () => {
    const stream = new InMemoryStream<string>(silentLogger, 'test', {
      ttlSeconds: 1,
    });
    await stream.append('a');
    await stream.append('b');
    expect(await stream.all()).toHaveLength(2);

    stream.maintain(Date.now() + 2000);
    expect(await stream.all()).toHaveLength(0);
  });

  it('skips expired items on read even before a sweep runs', async () => {
    const stream = new InMemoryStream<string>(silentLogger, 'test', {
      ttlSeconds: 0.001,
    });
    await stream.append('a');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await stream.all()).toHaveLength(0);
  });
});

describe('InMemoryStream — byte-budget eviction', () => {
  it('evicts oldest until under maxBytes on maintain, keeping most recent', async () => {
    const stream = new InMemoryStream<string>(silentLogger, 'test', {
      maxBytes: 3000,
    });
    for (let i = 0; i < 10; i++) await stream.append('x'.repeat(1000));

    stream.maintain();
    const all = await stream.all();
    const bytes = all.reduce(
      (n, it) => n + Buffer.byteLength(JSON.stringify(it)),
      0
    );
    expect(bytes).toBeLessThanOrEqual(3000);
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.at(-1)!.sequenceNumber).toBe(10);
  });
});

describe('InMemoryStream — compact-on-load', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'in-memory-stream-compact-'));
  });
  afterEach(() => {
    rmSync(tmpDir, {recursive: true, force: true});
  });

  it('loads an oversized file within the byte budget and rewrites it smaller', async () => {
    const path = join(tmpDir, 'store.json');
    const writer = new InMemoryStream<string>(silentLogger, 'test', {path});
    for (let i = 0; i < 5000; i++) await writer.append('y'.repeat(200));
    await writer.save();
    const bigSize = statSync(path).size;
    expect(bigSize).toBeGreaterThan(500_000);

    const reloaded = new InMemoryStream<string>(silentLogger, 'test', {
      path,
      maxBytes: 20_000,
    });
    await reloaded.init();
    reloaded.close();

    const all = await reloaded.all();
    const bytes = all.reduce(
      (n, it) => n + Buffer.byteLength(JSON.stringify(it)),
      0
    );
    expect(bytes).toBeLessThanOrEqual(20_000);
    expect(statSync(path).size).toBeLessThan(bigSize);
  });
});

describe('InMemoryStream — close stops the sweep timer', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stops age-based eviction after close()', async () => {
    jest.useFakeTimers();
    const stream = new InMemoryStream<string>(silentLogger, 'test', {
      ttlSeconds: 1,
    });
    await stream.init();

    await stream.append('a');
    jest.advanceTimersByTime(1500);
    expect(stream.cachedItemCount()).toBe(0);

    await stream.append('b');
    stream.close();
    jest.advanceTimersByTime(5000);
    expect(stream.cachedItemCount()).toBe(1);
  });
});
