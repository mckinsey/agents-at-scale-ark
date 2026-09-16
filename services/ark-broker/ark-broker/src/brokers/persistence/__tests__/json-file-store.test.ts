import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  statSync,
  existsSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JsonFileStore} from '@ark-broker/brokers/persistence/json-file-store.js';
import {createLogger} from '@ark-broker/logging/logger.js';

const logger = createLogger({level: 'silent', pretty: false});

type Item = {sequenceNumber: number; data: string};

function item(seq: number, dataBytes = 1): Item {
  return {sequenceNumber: seq, data: 'x'.repeat(dataBytes)};
}

function totalBytes(items: Item[]): number {
  return items.reduce((n, it) => n + Buffer.byteLength(JSON.stringify(it)), 0);
}

// A pre-JSONL monolithic snapshot, the format migrated away from.
function legacy(items: Item[], nextSequence: number): string {
  return JSON.stringify({items, nextSequence});
}

// JSONL text: a header line then one record per line.
function jsonl(items: Item[], nextSequence: number): string {
  return (
    [
      JSON.stringify({nextSequence}),
      ...items.map((it) => JSON.stringify(it)),
    ].join('\n') + '\n'
  );
}

describe('JsonFileStore', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'json-file-store-'));
    path = join(dir, 'data.jsonl');
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('no-ops without a path', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test');
    await store.save([item(1)], 2);
    expect(store.enabled).toBe(false);
    expect(await store.loadBounded({})).toBeNull();
  });

  it('returns null when neither the .jsonl nor a legacy .json exists', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    expect(await store.loadBounded({})).toBeNull();
  });

  it('persists and reloads the latest snapshot', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([item(1), item(2)], 3);

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({});
    expect(loaded).toEqual({items: [item(1), item(2)], nextSequence: 3});
  });

  it('writes JSONL: a header line then one record per line', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([item(1), item(2)], 3);

    const lines = readFileSync(path, 'utf-8').trimEnd().split('\n');
    expect(JSON.parse(lines[0])).toEqual({nextSequence: 3});
    expect(JSON.parse(lines[1])).toEqual(item(1));
    expect(JSON.parse(lines[2])).toEqual(item(2));
    expect(lines).toHaveLength(3);
  });

  it('coalesces a burst of saves and persists the final state', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);

    const items: Item[] = [];
    const saves: Promise<void>[] = [];
    for (let i = 1; i <= 100; i++) {
      items.push(item(i));
      saves.push(store.save([...items], i + 1));
    }
    await Promise.all(saves);

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({});
    expect(loaded?.items).toHaveLength(100);
    expect(loaded?.nextSequence).toBe(101);
  });

  it('folds a save issued mid-flush into the trailing write (not lost)', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);

    // The first save() launches flush(), which runs synchronously up to its
    // writeFile await, so the second save() below provably lands while the flush
    // is in flight. It must be persisted by the trailing pass, not dropped.
    const first = store.save([item(1)], 2);
    const second = store.save([item(1), item(2)], 3);
    await Promise.all([first, second]);

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({});
    expect(loaded).toEqual({items: [item(1), item(2)], nextSequence: 3});
  });

  it('starts a fresh flush after the previous one has drained', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);

    await store.save([item(1)], 2);
    await store.save([item(1), item(2)], 3);

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({});
    expect(loaded).toEqual({items: [item(1), item(2)], nextSequence: 3});
  });

  it('leaves no temp file behind after writing', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([item(1)], 2);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('fails safe on a write error without corrupting the last good file', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([item(1)], 2);

    // Sabotage the next full rewrite: occupy the temp path with a directory so
    // writeFile(`${path}.tmp`) fails (EISDIR). Only the atomic rewrite path uses
    // the temp file, so drive a compaction to exercise it.
    mkdirSync(`${path}.tmp`);

    // The failed write must resolve (swallowed, not thrown) ...
    await expect(store.compact([item(1), item(2)], 3)).resolves.toBeUndefined();

    // ... and the previous good snapshot must survive intact.
    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({});
    expect(loaded).toEqual({items: [item(1)], nextSequence: 2});
  });
});

describe('JsonFileStore.loadBounded — JSONL', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'json-file-store-jsonl-'));
    path = join(dir, 'data.jsonl');
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('retains only the most recent tail within the byte budget', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save(
      Array.from({length: 100}, (_, i) => item(i + 1, 1000)),
      101
    );

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 5000});

    expect(loaded!.items.length).toBeGreaterThanOrEqual(1);
    expect(loaded!.items.length).toBeLessThan(100);
    // The real guarantee: retained bytes stay within the budget, not merely a
    // smaller item count.
    expect(totalBytes(loaded!.items)).toBeLessThanOrEqual(5000);
    // The retained window is the most recent items.
    expect(loaded!.items.at(-1)!.sequenceNumber).toBe(100);
    expect(loaded!.items[0].sequenceNumber).toBeGreaterThan(1);
  });

  it('bounds memory by bytes regardless of item count', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    // ~10 MB on disk across 50k items.
    await store.save(
      Array.from({length: 50_000}, (_, i) => item(i + 1, 200)),
      50_001
    );
    expect(statSync(path).size).toBeGreaterThan(5_000_000);

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 20_000});

    expect(totalBytes(loaded!.items)).toBeLessThanOrEqual(20_000);
    expect(loaded!.items.at(-1)!.sequenceNumber).toBe(50_000);
    expect(loaded!.nextSequence).toBe(50_001);
  });

  it('recovers nextSequence from the header even when items are trimmed below it', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([item(5, 10)], 20);

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 100_000});

    expect(loaded!.nextSequence).toBe(20);
  });

  it('keeps the valid prefix when the trailing line is torn', async () => {
    const header = JSON.stringify({nextSequence: 3});
    // A crash mid-write leaves a partial final line.
    writeFileSync(
      path,
      `${header}\n${JSON.stringify(item(1))}\n{"sequenceNumber":2,"da`
    );

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 100_000});

    expect(loaded!.items).toEqual([item(1)]);
    expect(loaded!.nextSequence).toBe(3);
  });
});

describe('JsonFileStore.loadBounded — legacy .json migration to a new .jsonl', () => {
  let dir: string;
  let path: string;
  let legacyPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'json-file-store-legacy-'));
    path = join(dir, 'data.jsonl');
    legacyPath = join(dir, 'data.json');
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('migrates a monolithic .json into a new .jsonl, leaving the .json intact', async () => {
    const original = legacy([item(1), item(2)], 3);
    writeFileSync(legacyPath, original);

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 100_000});

    expect(loaded).toEqual({items: [item(1), item(2)], nextSequence: 3});
    // A new .jsonl file exists in JSONL form ...
    expect(existsSync(path)).toBe(true);
    const lines = readFileSync(path, 'utf-8').trimEnd().split('\n');
    expect(JSON.parse(lines[0])).toEqual({nextSequence: 3});
    expect(JSON.parse(lines[1])).toEqual(item(1));
    // ... and the legacy .json is untouched (rollback-safe).
    expect(readFileSync(legacyPath, 'utf-8')).toBe(original);
  });

  it('prefers an existing .jsonl and never reads the legacy .json', async () => {
    writeFileSync(legacyPath, legacy([item(1)], 2));
    // Different content in the .jsonl proves it wins.
    writeFileSync(path, jsonl([item(9)], 10));

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 100_000});

    expect(loaded).toEqual({items: [item(9)], nextSequence: 10});
  });

  it('bounds a legacy snapshot by bytes during migration', async () => {
    writeFileSync(
      legacyPath,
      legacy(
        Array.from({length: 100}, (_, i) => item(i + 1, 1000)),
        101
      )
    );

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 5000});

    expect(totalBytes(loaded!.items)).toBeLessThanOrEqual(5000);
    expect(loaded!.items.at(-1)!.sequenceNumber).toBe(100);
    expect(loaded!.nextSequence).toBe(101);
    // New file is JSONL and bounded to the retained tail.
    expect(readFileSync(path, 'utf-8').startsWith('{"nextSequence"')).toBe(
      true
    );
  });

  it('keeps the valid prefix when a legacy snapshot is torn', async () => {
    const good = JSON.stringify(item(1, 5));
    writeFileSync(
      legacyPath,
      `{"items":[${good},{"sequenceNumber":2,"timestamp":"2026-01`
    );

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({maxBytes: 100_000});

    expect(loaded!.items).toEqual([item(1, 5)]);
  });
});

describe('JsonFileStore — append-delta and compaction', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'json-file-store-append-'));
    path = join(dir, 'data.jsonl');
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('appends only new records and leaves the header stale (not a full rewrite)', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([item(1)], 2); // first write establishes the baseline
    await store.save([item(1), item(2)], 3); // appends item(2) only

    const lines = readFileSync(path, 'utf-8').trimEnd().split('\n');
    // The header still carries the baseline's nextSequence: proof the second
    // write appended rather than rewriting the whole file (a rewrite would have
    // written {nextSequence:3}).
    expect(JSON.parse(lines[0])).toEqual({nextSequence: 2});
    expect(JSON.parse(lines[1])).toEqual(item(1));
    expect(JSON.parse(lines[2])).toEqual(item(2));
    expect(lines).toHaveLength(3);

    // Recovery derives the true nextSequence from the last record despite the
    // stale header.
    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({});
    expect(loaded).toEqual({items: [item(1), item(2)], nextSequence: 3});
  });

  it('grows the file by the delta, not by rewriting the whole set', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    const items: Item[] = [item(1)];
    await store.save([...items], 2);

    for (let i = 2; i <= 20; i++) {
      items.push(item(i));
      await store.save([...items], i + 1);
    }

    const lines = readFileSync(path, 'utf-8').trimEnd().split('\n');
    // Header + 20 records, and the header is still the baseline value — every
    // write after the first was an append.
    expect(lines).toHaveLength(21);
    expect(JSON.parse(lines[0])).toEqual({nextSequence: 2});
    expect(JSON.parse(lines.at(-1)!)).toEqual(item(20));
  });

  it('compacts when the log outgrows the live set, dropping evicted records', async () => {
    // compactRatio=1: rewrite as soon as the log exceeds the live count. The
    // sliding window simulates the in-memory byte eviction the store sees.
    const store = new JsonFileStore<Item>(logger, 'Test', path, 1);
    await store.save([item(1)], 2); // baseline: header{2}, log=1
    await store.save([item(1), item(2)], 3); // append 2: log=2
    await store.save([item(2), item(3)], 4); // evict 1, append 3: log=3
    await store.save([item(3), item(4)], 5); // log(3) > 1*2 → compact

    const lines = readFileSync(path, 'utf-8').trimEnd().split('\n');
    // Header refreshed to the current nextSequence, evicted 1 and 2 dropped,
    // order preserved.
    expect(JSON.parse(lines[0])).toEqual({nextSequence: 5});
    expect(lines.slice(1).map((l) => JSON.parse(l))).toEqual([
      item(3),
      item(4),
    ]);

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({});
    expect(loaded).toEqual({items: [item(3), item(4)], nextSequence: 5});
  });

  it('skips a torn trailing line from a crash mid-append', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([item(1)], 2);
    await store.save([item(1), item(2)], 3); // appended record

    // A crash mid-append leaves a partial final line with no newline.
    appendFileSync(path, '{"sequenceNumber":3,"da');

    const loaded = await new JsonFileStore<Item>(
      logger,
      'Test',
      path
    ).loadBounded({});
    expect(loaded).toEqual({items: [item(1), item(2)], nextSequence: 3});
  });
});
