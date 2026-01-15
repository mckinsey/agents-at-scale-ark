import { BrokerItem } from './broker-item.js';
import { BrokerItemStream } from './broker-item-stream.js';
import { PaginatedList, PaginationParams, DEFAULT_LIMIT } from './pagination.js';

/** OTEL span data */
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
  resource?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Broker for storing OTEL trace spans.
 * Spans are grouped by trace ID.
 */
export class TraceBroker {
  private stream: BrokerItemStream<OTELSpan>;

  constructor(path?: string, maxItems?: number) {
    this.stream = new BrokerItemStream<OTELSpan>('Trace', path, maxItems);
  }

  addSpan(span: OTELSpan): BrokerItem<OTELSpan> {
    return this.stream.append(span);
  }

  addSpans(spans: OTELSpan[]): BrokerItem<OTELSpan>[] {
    const items = spans.map(span => this.stream.append(span));
    this.save();
    return items;
  }

  getByTraceId(traceId: string): BrokerItem<OTELSpan>[] {
    return this.stream.filter(item => item.data.traceId === traceId);
  }

  getSpansByTraceId(traceId: string): OTELSpan[] {
    return this.getByTraceId(traceId).map(item => item.data);
  }

  getTraceIds(): string[] {
    const ids = new Set(this.stream.all().map(item => item.data.traceId));
    return Array.from(ids);
  }

  hasTrace(traceId: string): boolean {
    return this.stream.filter(item => item.data.traceId === traceId).length > 0;
  }

  all(): BrokerItem<OTELSpan>[] {
    return this.stream.all();
  }

  save(): void {
    this.stream.save();
  }

  delete(): void {
    this.stream.delete();
  }

  subscribe(callback: (item: BrokerItem<OTELSpan>) => void): () => void {
    return this.stream.subscribe(callback);
  }

  subscribeToTrace(traceId: string, callback: (item: BrokerItem<OTELSpan>) => void): () => void {
    return this.stream.subscribe(item => {
      if (item.data.traceId === traceId) {
        callback(item);
      }
    });
  }

  /**
   * Get paginated traces grouped by trace ID.
   * Returns traces in reverse chronological order (newest first).
   */
  paginateTraces(params: PaginationParams): PaginatedList<{ traceId: string; spans: OTELSpan[] }> {
    const limit = params.limit ?? DEFAULT_LIMIT;

    const allItems = this.stream.all();
    const traceMap = new Map<string, { firstSeq: number; spans: OTELSpan[] }>();

    for (const item of allItems) {
      const existing = traceMap.get(item.data.traceId);
      if (existing) {
        existing.spans.push(item.data);
        existing.firstSeq = Math.min(existing.firstSeq, item.sequenceNumber);
      } else {
        traceMap.set(item.data.traceId, {
          firstSeq: item.sequenceNumber,
          spans: [item.data]
        });
      }
    }

    let traces = Array.from(traceMap.entries())
      .map(([traceId, data]) => ({ traceId, spans: data.spans, firstSeq: data.firstSeq }))
      .sort((a, b) => b.firstSeq - a.firstSeq);

    const total = traces.length;

    if (params.cursor !== undefined) {
      traces = traces.filter(t => t.firstSeq < params.cursor!);
    }

    const items = traces.slice(0, limit).map(({ traceId, spans }) => ({ traceId, spans }));
    const hasMore = traces.length > limit;
    const nextCursor = items.length > 0 ? traces[items.length - 1]?.firstSeq : undefined;

    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore ? nextCursor : undefined
    };
  }

  paginate(params: PaginationParams): PaginatedList<BrokerItem<OTELSpan>> {
    return this.stream.paginate(params);
  }

  getCurrentSequence(): number {
    return this.stream.getCurrentSequence();
  }
}
