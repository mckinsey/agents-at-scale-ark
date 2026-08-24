import {existsSync, readFileSync, mkdirSync} from 'fs';
import {writeFile, rename} from 'fs/promises';
import {dirname} from 'path';
import type {Logger} from '@ark-broker/logging/logger.js';

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
