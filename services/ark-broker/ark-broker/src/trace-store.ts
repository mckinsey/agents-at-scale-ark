import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface OTELSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: number; boolValue?: boolean } }>;
  status?: { code?: number; message?: string };
  [key: string]: unknown;
}

export class TraceStore {
  private traces: Map<string, OTELSpan[]> = new Map();
  private allSpans: OTELSpan[] = [];
  private readonly traceFilePath?: string;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    this.traceFilePath = process.env.TRACE_FILE_PATH;
    this.loadFromFile();
  }

  addSpan(span: OTELSpan): void {
    const traceId = span.traceId;
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, []);
    }
    this.traces.get(traceId)!.push(span);
    this.allSpans.push(span);
    this.eventEmitter.emit(`span:${traceId}`, span);
    this.eventEmitter.emit('span:*', span);
  }

  addSpans(spans: OTELSpan[]): void {
    for (const span of spans) {
      this.addSpan(span);
    }
  }

  getSpans(traceId: string): OTELSpan[] {
    return this.traces.get(traceId) || [];
  }

  getAllSpans(): OTELSpan[] {
    return [...this.allSpans];
  }

  getAllTraces(): Record<string, OTELSpan[]> {
    const result: Record<string, OTELSpan[]> = {};
    for (const [key, value] of this.traces.entries()) {
      result[key] = value;
    }
    return result;
  }

  getTraceIds(): string[] {
    return Array.from(this.traces.keys());
  }

  hasTrace(traceId: string): boolean {
    return this.traces.has(traceId);
  }

  subscribeToTrace(traceId: string, callback: (span: OTELSpan) => void): () => void {
    const listener = (span: OTELSpan) => callback(span);
    this.eventEmitter.on(`span:${traceId}`, listener);
    return () => this.eventEmitter.off(`span:${traceId}`, listener);
  }

  subscribeToAllSpans(callback: (span: OTELSpan) => void): () => void {
    const listener = (span: OTELSpan) => callback(span);
    this.eventEmitter.on('span:*', listener);
    return () => this.eventEmitter.off('span:*', listener);
  }

  purge(): void {
    this.traces.clear();
    this.allSpans = [];
    this.saveToFile();
    console.log('[TRACE PURGE] Cleared all traces');
  }

  private loadFromFile(): void {
    if (!this.traceFilePath) {
      console.log('[TRACE LOAD] File persistence disabled - traces will not be saved');
      return;
    }

    try {
      if (existsSync(this.traceFilePath)) {
        const data = readFileSync(this.traceFilePath, 'utf-8');
        const parsed = JSON.parse(data);

        if (parsed && typeof parsed === 'object') {
          if (parsed.traces) {
            this.traces = new Map(Object.entries(parsed.traces));
          }
          if (parsed.allSpans && Array.isArray(parsed.allSpans)) {
            this.allSpans = parsed.allSpans;
          }
          console.log(`[TRACE LOAD] Loaded ${this.traces.size} traces (${this.allSpans.length} spans) from ${this.traceFilePath}`);
        } else {
          console.warn('[TRACE LOAD] Invalid data format in trace file, starting fresh');
        }
      } else {
        console.log(`[TRACE LOAD] Trace file not found at ${this.traceFilePath}, starting with 0 traces`);
      }
    } catch (error) {
      console.error(`[TRACE LOAD] Failed to load traces from file: ${error}`);
    }
  }

  private saveToFile(): void {
    if (!this.traceFilePath) return;

    try {
      const dir = dirname(this.traceFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const dataToSave = {
        traces: Object.fromEntries(this.traces),
        allSpans: this.allSpans
      };
      writeFileSync(this.traceFilePath, JSON.stringify(dataToSave, null, 2));
      console.log(`[TRACE SAVE] Saved ${this.traces.size} traces (${this.allSpans.length} spans) to ${this.traceFilePath}`);
    } catch (error) {
      console.error(`[TRACE SAVE] Failed to save traces to file: ${error}`);
    }
  }

  public saveTraces(): void {
    this.saveToFile();
  }
}
