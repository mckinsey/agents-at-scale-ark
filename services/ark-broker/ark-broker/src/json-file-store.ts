import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export class JsonFileStore<T> {
  constructor(
    private name: string,
    private path?: string,
    private maxItems?: number
  ) {
    if (path) {
      console.log(`[${name}] persistence enabled at ${path}`);
    }
  }

  load(): { items: T[]; nextSequence: number } | null {
    if (!this.path) return null;
    try {
      if (existsSync(this.path)) {
        const data = JSON.parse(readFileSync(this.path, 'utf-8'));
        if (!Array.isArray(data.items)) {
          console.error(`[${this.name}] invalid data format`);
          return null;
        }
        console.log(`[${this.name}] loaded ${data.items.length} records`);
        return data;
      } else {
        console.log(`[${this.name}] no existing data`);
      }
    } catch (e) {
      console.error(`[${this.name}] failed to load:`, e);
    }
    return null;
  }

  save(items: T[], nextSequence: number): void {
    if (!this.path) return;
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const limited = this.applyLimit(items);
      writeFileSync(this.path, JSON.stringify({ items: limited, nextSequence }, null, 2));
      console.log(`[${this.name}] saved ${limited.length} records`);
    } catch (e) {
      console.error(`[${this.name}] failed to save:`, e);
    }
  }

  private applyLimit(items: T[]): T[] {
    if (!this.maxItems || items.length <= this.maxItems) return items;
    const removed = items.length - this.maxItems;
    console.log(`[${this.name}] trimmed ${removed} items (limit: ${this.maxItems})`);
    return items.slice(-this.maxItems);
  }

  get enabled(): boolean {
    return !!this.path;
  }
}
