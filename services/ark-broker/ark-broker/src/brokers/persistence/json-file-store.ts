import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'fs';
import {dirname} from 'path';
import type {Logger} from '@ark-broker/logging/logger.js';

export class JsonFileStore<T> {
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

  save(items: T[], nextSequence: number): void {
    if (!this.path) return;
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
      const limited = this.applyLimit(items);
      writeFileSync(
        this.path,
        JSON.stringify({items: limited, nextSequence}, null, 2)
      );
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
