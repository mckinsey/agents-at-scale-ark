import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JsonFileStore} from '@ark-broker/brokers/persistence/json-file-store.js';
import {createLogger} from '@ark-broker/logging/logger.js';

const logger = createLogger({level: 'silent', pretty: false});

type Item = {id: number};

describe('JsonFileStore', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'json-file-store-'));
    path = join(dir, 'data.json');
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('no-ops without a path', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test');
    await store.save([{id: 1}], 2);
    expect(store.enabled).toBe(false);
  });

  it('persists and reloads the latest snapshot', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([{id: 1}, {id: 2}], 3);

    const loaded = new JsonFileStore<Item>(logger, 'Test', path).load();
    expect(loaded).toEqual({items: [{id: 1}, {id: 2}], nextSequence: 3});
  });

  it('writes compact JSON (no pretty-print indentation)', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([{id: 1}], 2);

    const raw = readFileSync(path, 'utf-8');
    expect(raw).not.toMatch(/\n {2}/);
    expect(raw).toBe('{"items":[{"id":1}],"nextSequence":2}');
  });

  it('coalesces a burst of saves and persists the final state', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);

    const items: Item[] = [];
    const saves: Promise<void>[] = [];
    for (let i = 1; i <= 100; i++) {
      items.push({id: i});
      saves.push(store.save([...items], i + 1));
    }
    await Promise.all(saves);

    const loaded = new JsonFileStore<Item>(logger, 'Test', path).load();
    expect(loaded?.items).toHaveLength(100);
    expect(loaded?.nextSequence).toBe(101);
  });

  it('folds a save issued mid-flush into the trailing write (not lost)', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);

    // The first save() launches flush(), which runs synchronously up to its
    // writeFile await, so the second save() below provably lands while the flush
    // is in flight. It must be persisted by the trailing pass, not dropped.
    const first = store.save([{id: 1}], 2);
    const second = store.save([{id: 1}, {id: 2}], 3);
    await Promise.all([first, second]);

    const loaded = new JsonFileStore<Item>(logger, 'Test', path).load();
    expect(loaded).toEqual({items: [{id: 1}, {id: 2}], nextSequence: 3});
  });

  it('starts a fresh flush after the previous one has drained', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);

    // The second save happens after the first fully resolves, so it depends on
    // `flushing` being reset — a stuck reset would leave the file at the first.
    await store.save([{id: 1}], 2);
    await store.save([{id: 1}, {id: 2}], 3);

    const loaded = new JsonFileStore<Item>(logger, 'Test', path).load();
    expect(loaded).toEqual({items: [{id: 1}, {id: 2}], nextSequence: 3});
  });

  it('leaves no temp file behind after writing', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([{id: 1}], 2);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('fails safe on a write error without corrupting the last good file', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([{id: 1}], 2);

    // Sabotage the next write: occupy the temp path with a directory so
    // writeFile(`${path}.tmp`) fails (EISDIR).
    mkdirSync(`${path}.tmp`);

    // The failed write must resolve (swallowed, not thrown) ...
    await expect(store.save([{id: 1}, {id: 2}], 3)).resolves.toBeUndefined();

    // ... and the previous good snapshot must survive intact.
    const loaded = new JsonFileStore<Item>(logger, 'Test', path).load();
    expect(loaded).toEqual({items: [{id: 1}], nextSequence: 2});
  });

  it('applies maxItems, keeping the most recent', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path, 2);
    await store.save([{id: 1}, {id: 2}, {id: 3}], 4);

    const loaded = new JsonFileStore<Item>(logger, 'Test', path).load();
    expect(loaded?.items).toEqual([{id: 2}, {id: 3}]);
  });
});

type Record = {sequenceNumber: number; timestamp: string; data: string};

function record(seq: number, dataBytes: number): Record {
  return {
    sequenceNumber: seq,
    timestamp: new Date(0).toISOString(),
    data: 'x'.repeat(dataBytes),
  };
}

function totalBytes(items: Record[]): number {
  return items.reduce((n, it) => n + Buffer.byteLength(JSON.stringify(it)), 0);
}

describe('JsonFileStore.loadBounded', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'json-file-store-bounded-'));
    path = join(dir, 'data.json');
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('retains only the most recent tail within the byte budget', async () => {
    const store = new JsonFileStore<Record>(logger, 'Test', path);
    const items = Array.from({length: 100}, (_, i) => record(i + 1, 1000));
    await store.save(items, 101);

    const loaded = await new JsonFileStore<Record>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 5000});

    expect(loaded).not.toBeNull();
    expect(loaded!.items.length).toBeGreaterThanOrEqual(1);
    expect(loaded!.items.length).toBeLessThan(100);
    // The real guarantee: retained bytes stay within the budget (with >1 item
    // the loader evicts until under it), not merely a smaller item count.
    expect(totalBytes(loaded!.items)).toBeLessThanOrEqual(5000);
    // The retained window is the most recent items.
    expect(loaded!.items.at(-1)!.sequenceNumber).toBe(100);
    expect(loaded!.items[0].sequenceNumber).toBeGreaterThan(1);
  });

  it('bounds memory by bytes regardless of item count', async () => {
    const store = new JsonFileStore<Record>(logger, 'Test', path);
    // ~10 MB on disk across 50k items — a count-based cap would not bound this.
    const items = Array.from({length: 50_000}, (_, i) => record(i + 1, 200));
    await store.save(items, 50_001);
    expect(statSync(path).size).toBeGreaterThan(5_000_000);

    const loaded = await new JsonFileStore<Record>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 20_000});

    expect(totalBytes(loaded!.items)).toBeLessThanOrEqual(20_000);
    expect(loaded!.items.at(-1)!.sequenceNumber).toBe(50_000);
    expect(loaded!.nextSequence).toBe(50_001);
  });

  it('recovers persisted nextSequence even when items are trimmed below it', async () => {
    const store = new JsonFileStore<Record>(logger, 'Test', path);
    await store.save([record(5, 10)], 20);

    const loaded = await new JsonFileStore<Record>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 100_000});

    expect(loaded!.nextSequence).toBe(20);
  });

  it('keeps the valid prefix when the trailing record is torn', async () => {
    const good = JSON.stringify(record(1, 5));
    writeFileSync(
      path,
      `{"items":[${good},{"sequenceNumber":2,"timestamp":"2026-01`
    );

    const loaded = await new JsonFileStore<Record>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 100_000});

    expect(loaded!.items).toHaveLength(1);
    expect(loaded!.items[0].sequenceNumber).toBe(1);
  });
});
