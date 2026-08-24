import {mkdtempSync, rmSync, readFileSync, existsSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
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

  it('leaves no temp file behind after writing', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path);
    await store.save([{id: 1}], 2);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('applies maxItems, keeping the most recent', async () => {
    const store = new JsonFileStore<Item>(logger, 'Test', path, 2);
    await store.save([{id: 1}, {id: 2}, {id: 3}], 4);

    const loaded = new JsonFileStore<Item>(logger, 'Test', path).load();
    expect(loaded?.items).toEqual([{id: 2}, {id: 3}]);
  });
});
