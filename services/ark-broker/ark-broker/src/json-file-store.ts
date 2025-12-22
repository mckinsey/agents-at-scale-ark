import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export class JsonFileStore<T> {
  constructor(
    private name: string,
    private path?: string,
    private getCount?: (data: T) => number,
    private maxItems?: number
  ) {
    if (path) {
      console.log(`[${name}] persistence enabled at ${path}`);
    }
  }

  load(): T | null {
    if (!this.path) return null;
    try {
      if (existsSync(this.path)) {
        const data = JSON.parse(readFileSync(this.path, 'utf-8'));
        const count = this.getCount ? this.getCount(data) : null;
        console.log(`[${this.name}] loaded${count !== null ? ` ${count} records` : ''}`);
        return data;
      } else {
        console.log(`[${this.name}] no existing data`);
      }
    } catch (e) {
      console.error(`[${this.name}] failed to load:`, e);
    }
    return null;
  }

  save(data: T): void {
    if (!this.path) return;
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const limited = this.applyLimit(data);
      writeFileSync(this.path, JSON.stringify(limited, null, 2));
      const count = this.getCount ? this.getCount(limited) : null;
      console.log(`[${this.name}] saved${count !== null ? ` ${count} records` : ''}`);
    } catch (e) {
      console.error(`[${this.name}] failed to save:`, e);
    }
  }

  private applyLimit(data: T): T {
    if (!this.maxItems || !Array.isArray(data)) return data;
    if (data.length <= this.maxItems) return data;
    const removed = data.length - this.maxItems;
    console.log(`[${this.name}] trimmed ${removed} items (limit: ${this.maxItems})`);
    return data.slice(-this.maxItems) as T;
  }

  get enabled(): boolean {
    return !!this.path;
  }
}
