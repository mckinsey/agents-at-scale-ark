import {createReadStream, existsSync, mkdirSync} from 'node:fs';
import {open, writeFile, rename, appendFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {dirname} from 'node:path';
// Used ONLY to migrate a legacy monolithic snapshot to JSONL on first load;
// steady-state reads use readline with no parser at all.
import {JSONParser} from '@streamparser/json-node';
import type {Logger} from '@ark-broker/logging/logger.js';

// A legacy monolithic snapshot is a single `{"items":[...],"nextSequence":N}`
// object; the JSONL format starts with a `{"nextSequence":N}` header line.
const LEGACY_PREFIX = '{"items"';

// Between compactions the append log may grow to this multiple of the live
// record count before the next flush rewrites it in full. Bounds the file to
// ~ratio× the (already byte-capped) in-memory set. Injectable for tests.
const COMPACT_RATIO = 2;

type Limits = {maxBytes?: number};
type Loaded<T> = {items: T[]; nextSequence: number};

export class JsonFileStore<T> {
  private flushing: Promise<void> | null = null;
  private pending: {
    items: T[];
    nextSequence: number;
    compact: boolean;
  } | null = null;
  // Highest sequence number written to disk; appends persist only records above
  // it, and the header is refreshed from it on compaction.
  private lastPersistedSequence = 0;
  // Record lines currently in the file. Drives the compaction threshold.
  private logRecordCount = 0;
  private baselineWritten = false;
  // The sibling `.json` this store may migrate from once. It is only ever read,
  // never written, so a rollback to the pre-.jsonl build still finds it intact.
  private readonly legacyPath?: string;

  constructor(
    private readonly logger: Logger,
    private readonly name: string,
    private readonly path?: string,
    private readonly compactRatio = COMPACT_RATIO
  ) {
    this.legacyPath = path?.endsWith('.jsonl')
      ? path.replace(/\.jsonl$/, '.json')
      : undefined;
    if (path) {
      this.logger.info({path}, 'persistence enabled');
    }
  }

  // Sole loader. Never materializes the whole file: JSONL is read line by line
  // and a legacy monolithic snapshot is stream-parsed, both retaining only the
  // most-recent tail within `maxBytes`. Steady state reads the `.jsonl` at
  // `path`. If that does not exist yet, a one-time migration reads the sibling
  // pre-JSONL `.json` snapshot and writes a new `.jsonl`, leaving the `.json`
  // untouched so a rollback can still read it. A torn trailing record keeps the
  // valid prefix rather than discarding all.
  async loadBounded(limits: Limits): Promise<Loaded<T> | null> {
    if (!this.path) return null;
    if (existsSync(this.path)) {
      return this.readFrom(this.path, limits);
    }
    if (this.legacyPath && existsSync(this.legacyPath)) {
      const loaded = await this.readFrom(this.legacyPath, limits);
      if (loaded) {
        this.logger.info(
          {from: this.legacyPath, to: this.path},
          'migrating legacy store to a new .jsonl file'
        );
        await this.compact(loaded.items, loaded.nextSequence);
      }
      return loaded;
    }
    this.logger.info('no existing data');
    return null;
  }

  private async readFrom(
    filePath: string,
    limits: Limits
  ): Promise<Loaded<T> | null> {
    try {
      const format = await this.detectFormat(filePath);
      if (format === 'empty') return null;
      return format === 'legacy'
        ? await this.readLegacy(filePath, limits)
        : await this.readJsonl(filePath, limits);
    } catch (err) {
      this.logger.error({err, path: filePath}, 'failed to load');
      return null;
    }
  }

  private async detectFormat(
    filePath: string
  ): Promise<'jsonl' | 'legacy' | 'empty'> {
    const fd = await open(filePath, 'r');
    try {
      const buf = Buffer.alloc(64);
      const {bytesRead} = await fd.read(buf, 0, 64, 0);
      const head = buf.toString('utf-8', 0, bytesRead).trimStart();
      if (head.length === 0) return 'empty';
      return head.startsWith(LEGACY_PREFIX) ? 'legacy' : 'jsonl';
    } finally {
      await fd.close();
    }
  }

  private async readJsonl(
    filePath: string,
    limits: Limits
  ): Promise<Loaded<T>> {
    const {maxBytes} = limits;
    const buf: T[] = [];
    const sizes: number[] = [];
    let bytes = 0;
    let headerSequence = 0;
    let sawHeader = false;
    const rl = createInterface({
      input: createReadStream(filePath, {encoding: 'utf-8'}),
      crlfDelay: Infinity,
    });
    try {
      for await (const line of rl) {
        if (line.length === 0) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          // Torn/partial line (e.g. a crash mid-write). Skip it.
          continue;
        }
        if (!sawHeader) {
          sawHeader = true;
          const header = parsed as {nextSequence?: unknown; items?: unknown};
          if (
            typeof header.nextSequence === 'number' &&
            header.items === undefined
          ) {
            headerSequence = header.nextSequence;
            continue;
          }
        }
        const size = Buffer.byteLength(line);
        buf.push(parsed as T);
        sizes.push(size);
        bytes += size;
        while (buf.length > 1 && maxBytes !== undefined && bytes > maxBytes) {
          bytes -= sizes.shift()!;
          buf.shift();
        }
      }
    } finally {
      rl.close();
    }
    this.logger.info({count: buf.length}, 'loaded records (jsonl)');
    return {
      items: buf,
      nextSequence: Math.max(headerSequence, this.deriveNextSequence(buf)),
    };
  }

  // Bounded stream-parse of a legacy monolithic snapshot. The caller writes the
  // result to the new `.jsonl`; this method never rewrites the legacy file.
  private async readLegacy(
    filePath: string,
    limits: Limits
  ): Promise<Loaded<T>> {
    const {
      items,
      nextSequence: persisted,
      dropped,
    } = await this.streamLegacy(filePath, limits);
    const nextSequence = Math.max(
      persisted ?? 0,
      this.deriveNextSequence(items)
    );
    if (dropped > 0) {
      this.logger.warn(
        {dropped, retained: items.length},
        'legacy snapshot exceeded the byte budget on migration; kept the most ' +
          'recent records and dropped the oldest — raise the stream byte budget to retain more'
      );
    } else {
      this.logger.info(
        {count: items.length},
        'read legacy snapshot for migration'
      );
    }
    return {items, nextSequence};
  }

  // Single bounded pass over the legacy object: collect the most-recent tail of
  // `items` within the budget and capture `nextSequence`. Never holds the whole
  // file in memory; a torn tail keeps the valid prefix.
  private streamLegacy(
    filePath: string,
    limits: Limits
  ): Promise<{items: T[]; nextSequence?: number; dropped: number}> {
    const {maxBytes} = limits;
    return new Promise((resolve) => {
      const buf: T[] = [];
      const sizes: number[] = [];
      let bytes = 0;
      let dropped = 0;
      let nextSequence: number | undefined;
      let settled = false;
      const evictOldestWhileOver = (): void => {
        while (buf.length > 1 && maxBytes !== undefined && bytes > maxBytes) {
          bytes -= sizes.shift()!;
          buf.shift();
          dropped++;
        }
      };
      // .pipe() does not tear down the source when the parser errors, so destroy
      // it explicitly to avoid leaking the fd on the torn-tail path.
      const source = createReadStream(filePath);
      const finish = (err?: unknown): void => {
        if (settled) return;
        settled = true;
        source.destroy();
        if (err) {
          this.logger.warn({err}, 'parse error on load; keeping valid prefix');
        }
        resolve({items: buf, nextSequence, dropped});
      };
      // keepStack:false so the parser does not retain emitted array elements in
      // their parent — without it the whole `items` array accumulates in memory
      // and an oversized legacy file OOMs, defeating the bounded load.
      const jsonParser = new JSONParser({
        paths: ['$.items.*', '$.nextSequence'],
        keepStack: false,
      });
      source.on('error', finish);
      jsonParser.on('error', finish);
      jsonParser.on(
        'data',
        (d: {key: string | number; value: unknown}): void => {
          if (d.key === 'nextSequence') {
            if (typeof d.value === 'number') nextSequence = d.value;
            return;
          }
          const item = d.value as T;
          const size = Buffer.byteLength(JSON.stringify(item));
          buf.push(item);
          sizes.push(size);
          bytes += size;
          evictOldestWhileOver();
        }
      );
      jsonParser.on('end', () => finish());
      source.pipe(jsonParser);
    });
  }

  private deriveNextSequence(items: T[]): number {
    const last = items.at(-1) as {sequenceNumber?: number} | undefined;
    return last?.sequenceNumber === undefined ? 1 : last.sequenceNumber + 1;
  }

  // Coalesced, non-blocking append. The caller records the latest state and the
  // resolved promise guarantees it (or a newer state) reached disk, but the
  // write runs off the event loop and at most one is in flight — so a burst of
  // saves collapses to a trailing write. Only records above the last persisted
  // sequence are appended (O(delta)); the log is periodically rewritten in full
  // (see compact) to reclaim evicted records and stay bounded. `items` is read
  // at write time, so a save issued mid-flush is folded into the trailing pass.
  save(items: T[], nextSequence: number): Promise<void> {
    return this.enqueue(items, nextSequence, false);
  }

  // Force a full rewrite of the current set. Callers use this when records were
  // removed (delete) or on load: an append cannot express a removal, and the
  // rewrite refreshes the header so nextSequence recovery cannot regress.
  compact(items: T[], nextSequence: number): Promise<void> {
    return this.enqueue(items, nextSequence, true);
  }

  private enqueue(
    items: T[],
    nextSequence: number,
    compact: boolean
  ): Promise<void> {
    if (!this.path) return Promise.resolve();
    // Compaction is sticky across coalescing: once a removal has requested a
    // full rewrite, an append folded into the same pass must not downgrade it,
    // or the removed records would survive on disk.
    this.pending = {
      items,
      nextSequence,
      compact: compact || (this.pending?.compact ?? false),
    };
    if (this.flushing) return this.flushing;
    this.flushing = this.flush();
    return this.flushing;
  }

  private async flush(): Promise<void> {
    try {
      // The final `while` check and the `finally` reset run with no await
      // between them, so a save() cannot slot in between "loop sees no pending"
      // and "flush marked done": it either set pending before the check (drained
      // by another pass) or runs after the reset (starts a fresh flush). Do not
      // introduce an await in that window — it would let a coalesced save be lost.
      while (this.pending) {
        const {items, nextSequence, compact} = this.pending;
        this.pending = null;
        await this.write(items, nextSequence, compact);
      }
    } finally {
      this.flushing = null;
    }
  }

  private async write(
    items: T[],
    nextSequence: number,
    compact: boolean
  ): Promise<void> {
    const mustCompact =
      compact ||
      !this.baselineWritten ||
      this.logRecordCount > this.compactRatio * Math.max(items.length, 1);
    if (mustCompact) {
      await this.writeSnapshot(items, nextSequence);
    } else {
      await this.appendDelta(items, nextSequence);
    }
  }

  // Full-rewrite JSONL snapshot: a `{"nextSequence":N}` header line followed by
  // one record per line. Written to a temp file and atomically renamed. Resets
  // the append baseline so subsequent saves append only newer records.
  private async writeSnapshot(items: T[], nextSequence: number): Promise<void> {
    if (!this.path) return;
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
      const tmp = `${this.path}.tmp`;
      const lines = [JSON.stringify({nextSequence})];
      for (const item of items) lines.push(JSON.stringify(item));
      await writeFile(tmp, lines.join('\n') + '\n');
      await rename(tmp, this.path);
      this.lastPersistedSequence = nextSequence - 1;
      this.logRecordCount = items.length;
      this.baselineWritten = true;
      this.logger.info({count: items.length}, 'saved records');
    } catch (err) {
      this.logger.error({err}, 'failed to save');
    }
  }

  // Append only records above the last persisted sequence (O(delta)). A partial
  // final line from a crash mid-write is skipped on load, and the stale header
  // is corrected there via max(header, last record + 1).
  private async appendDelta(items: T[], nextSequence: number): Promise<void> {
    if (!this.path) return;
    const delta = items.filter((item) => {
      const seq = (item as {sequenceNumber?: number}).sequenceNumber;
      return seq !== undefined && seq > this.lastPersistedSequence;
    });
    if (delta.length === 0) return;
    try {
      const lines = delta.map((item) => JSON.stringify(item)).join('\n') + '\n';
      await appendFile(this.path, lines);
      this.lastPersistedSequence = nextSequence - 1;
      this.logRecordCount += delta.length;
      this.logger.info(
        {appended: delta.length, count: this.logRecordCount},
        'appended records'
      );
    } catch (err) {
      this.logger.error({err}, 'failed to append');
    }
  }

  get enabled(): boolean {
    return !!this.path;
  }
}
