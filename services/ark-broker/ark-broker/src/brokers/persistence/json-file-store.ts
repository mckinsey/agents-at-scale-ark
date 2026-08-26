import {createReadStream, existsSync, readFileSync, mkdirSync} from 'node:fs';
import {writeFile, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
// stream-json ships CommonJS; under native ESM only the default export binds,
// so reach the lowercase factories through it rather than via named imports.
import parser from 'stream-json';
import PickFilter from 'stream-json/filters/Pick.js';
import StreamArrayStreamer from 'stream-json/streamers/StreamArray.js';
import StreamValuesStreamer from 'stream-json/streamers/StreamValues.js';
import type {Logger} from '@ark-broker/logging/logger.js';

const {pick} = PickFilter;
const {streamArray} = StreamArrayStreamer;
const {streamValues} = StreamValuesStreamer;

export class JsonFileStore<T> {
  private flushing: Promise<void> | null = null;
  private pending: {items: T[]; nextSequence: number} | null = null;

  constructor(
    private readonly logger: Logger,
    private name: string,
    private path?: string,
    private maxItems?: number
  ) {
    if (path) {
      this.logger.info({path}, 'persistence enabled');
    }
  }

  load(): {items: T[]; nextSequence: number} | null {
    if (!this.path) return null;
    try {
      if (existsSync(this.path)) {
        const data = JSON.parse(readFileSync(this.path, 'utf-8'));
        if (!Array.isArray(data.items)) {
          this.logger.error('invalid data format');
          return null;
        }
        this.logger.info({count: data.items.length}, 'loaded records');
        return data;
      } else {
        this.logger.info('no existing data');
      }
    } catch (err) {
      this.logger.error({err}, 'failed to load');
    }
    return null;
  }

  // Streaming load that never materializes the whole file: parses items one at
  // a time and retains only the most recent tail within a byte budget (and an
  // optional item-count cap), so an oversized file loads in memory bounded by
  // `maxBytes` — not by item count, which does not bound bytes. A torn trailing
  // record (crash mid-write) keeps the valid prefix rather than discarding all.
  async loadBounded(limits: {
    maxBytes?: number;
    maxItems?: number;
  }): Promise<{items: T[]; nextSequence: number} | null> {
    if (!this.path) return null;
    if (!existsSync(this.path)) {
      this.logger.info('no existing data');
      return null;
    }
    try {
      const items = await this.streamItems(limits);
      const persisted = await this.readNextSequence();
      const derived = this.deriveNextSequence(items);
      this.logger.info({count: items.length}, 'loaded records (streamed)');
      return {items, nextSequence: Math.max(persisted ?? 0, derived)};
    } catch (err) {
      this.logger.error({err}, 'failed to load (streamed)');
      return null;
    }
  }

  private streamItems(limits: {
    maxBytes?: number;
    maxItems?: number;
  }): Promise<T[]> {
    const {maxBytes, maxItems} = limits;
    return new Promise((resolve) => {
      const buf: T[] = [];
      const sizes: number[] = [];
      let bytes = 0;
      let settled = false;
      const evictOldestWhileOver = (): void => {
        while (
          buf.length > 1 &&
          ((maxBytes !== undefined && bytes > maxBytes) ||
            (maxItems !== undefined && maxItems > 0 && buf.length > maxItems))
        ) {
          bytes -= sizes.shift()!;
          buf.shift();
        }
      };
      // .pipe() does not tear down the source when a downstream stage errors,
      // so destroy it explicitly to avoid leaking the fd on the torn-tail path.
      const source = createReadStream(this.path!);
      const finish = (err?: unknown): void => {
        if (settled) return;
        settled = true;
        source.destroy();
        if (err) {
          this.logger.warn({err}, 'parse error on load; keeping valid prefix');
        }
        resolve(buf);
      };
      const items = source
        .on('error', finish)
        .pipe(parser())
        .on('error', finish)
        .pipe(pick({filter: 'items'}))
        .on('error', finish)
        .pipe(streamArray())
        .on('error', finish);
      items.on('data', ({value}: {value: T}) => {
        const size = Buffer.byteLength(JSON.stringify(value));
        buf.push(value);
        sizes.push(size);
        bytes += size;
        evictOldestWhileOver();
      });
      items.on('end', () => finish());
    });
  }

  private readNextSequence(): Promise<number | undefined> {
    return new Promise((resolve) => {
      let result: number | undefined;
      let settled = false;
      const source = createReadStream(this.path!);
      const finish = (): void => {
        if (settled) return;
        settled = true;
        source.destroy();
        resolve(result);
      };
      const values = source
        .on('error', finish)
        .pipe(parser())
        .on('error', finish)
        .pipe(pick({filter: 'nextSequence'}))
        .on('error', finish)
        .pipe(streamValues())
        .on('error', finish);
      values.on('data', ({value}: {value: unknown}) => {
        if (typeof value === 'number') result = value;
      });
      values.on('end', () => finish());
    });
  }

  private deriveNextSequence(items: T[]): number {
    const last = items.at(-1) as {sequenceNumber?: number} | undefined;
    return last?.sequenceNumber !== undefined ? last.sequenceNumber + 1 : 1;
  }

  // Coalesced, non-blocking snapshot. The caller records the latest state and
  // the resolved promise guarantees it (or a newer state) reached disk, but the
  // write runs off the event loop and at most one is in flight — so a burst of
  // saves collapses to a trailing write instead of one full-file rewrite per
  // event. `items` is read at write time, so a save issued mid-flush is folded
  // into the trailing pass rather than starting a second write.
  save(items: T[], nextSequence: number): Promise<void> {
    if (!this.path) return Promise.resolve();
    this.pending = {items, nextSequence};
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
        const {items, nextSequence} = this.pending;
        this.pending = null;
        await this.writeSnapshot(items, nextSequence);
      }
    } finally {
      this.flushing = null;
    }
  }

  private async writeSnapshot(items: T[], nextSequence: number): Promise<void> {
    if (!this.path) return;
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
      const limited = this.applyLimit(items);
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, JSON.stringify({items: limited, nextSequence}));
      await rename(tmp, this.path);
      this.logger.info({count: limited.length}, 'saved records');
    } catch (err) {
      this.logger.error({err}, 'failed to save');
    }
  }

  private applyLimit(items: T[]): T[] {
    if (!this.maxItems || items.length <= this.maxItems) return items;
    const removed = items.length - this.maxItems;
    this.logger.info({removed, limit: this.maxItems}, 'trimmed items');
    return items.slice(-this.maxItems);
  }

  get enabled(): boolean {
    return !!this.path;
  }
}
