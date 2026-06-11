import {mkdtempSync, rmSync} from 'fs';
import {join} from 'path';
import {tmpdir} from 'os';
import {InMemoryStream} from '../in-memory-stream.js';
import {createLogger} from '@ark-broker/logging/logger.js';
import {runStreamContract} from '../stream-contract.js';

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('InMemoryStream — Stream<T> contract', () => {
  runStreamContract(
    () => new InMemoryStream<string>(silentLogger, 'test'),
    (label) => label
  );
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
    const stream = new InMemoryStream<string>(silentLogger, 'test', path);

    await stream.append('hello');
    await stream.append('world');
    await stream.save();

    const reloaded = new InMemoryStream<string>(silentLogger, 'test', path);
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
    const stream = new InMemoryStream<string>(silentLogger, 'test', path);

    await stream.append('a');
    await stream.append('b');
    await stream.save();

    const reloaded = new InMemoryStream<string>(silentLogger, 'test', path);
    const c = await reloaded.append('c');
    expect(c.sequenceNumber).toBe(3);
  });

  it('starts fresh when no file exists', async () => {
    const path = join(tmpDir, 'nonexistent.json');
    const stream = new InMemoryStream<string>(silentLogger, 'test', path);
    expect(await stream.all()).toHaveLength(0);
    expect(await stream.getCurrentSequence()).toBe(0);
  });
});

describe('InMemoryStream — maxItems eviction', () => {
  it('retains only the most recent maxItems items', async () => {
    const stream = new InMemoryStream<string>(
      silentLogger,
      'test',
      undefined,
      3
    );

    await stream.append('a');
    await stream.append('b');
    await stream.append('c');
    await stream.append('d');

    const all = await stream.all();
    expect(all).toHaveLength(3);
    expect(all.map((i) => i.data)).toEqual(['b', 'c', 'd']);
  });

  it('subscriber still fires for items that get evicted', async () => {
    const stream = new InMemoryStream<string>(
      silentLogger,
      'test',
      undefined,
      2
    );
    const received: string[] = [];
    stream.subscribe((item) => received.push(item.data as string));

    await stream.append('a');
    await stream.append('b');
    await stream.append('c');

    expect(received).toEqual(['a', 'b', 'c']);
    expect((await stream.all()).map((i) => i.data)).toEqual(['b', 'c']);
  });
});
