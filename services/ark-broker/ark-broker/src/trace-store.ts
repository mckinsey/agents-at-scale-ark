import { EventEmitter } from 'events';
import { JsonFileStore } from './json-file-store';

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

interface TraceData {
  traces: Record<string, OTELSpan[]>;
  allSpans: OTELSpan[];
}

export class TraceStore {
  private traces: Map<string, OTELSpan[]> = new Map();
  private allSpans: OTELSpan[] = [];
  private fileStore = new JsonFileStore<TraceData>(
    'Trace',
    process.env.TRACE_FILE_PATH,
    (d) => Object.keys(d.traces).length
  );
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    const data = this.fileStore.load();
    if (data) {
      this.traces = new Map(Object.entries(data.traces));
      this.allSpans = data.allSpans ?? [];
    }
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
    this.save();
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
    this.save();
  }

  save(): void {
    this.fileStore.save({
      traces: Object.fromEntries(this.traces),
      allSpans: this.allSpans
    });
  }
}
