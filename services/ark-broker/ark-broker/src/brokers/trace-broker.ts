import {BrokerItem} from './stream/broker-item.js';
import {InMemoryStream} from './stream/in-memory-stream.js';
import type {Stream} from './stream/stream.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import {PaginatedList, PaginationParams, DEFAULT_LIMIT} from './pagination.js';

export function spanMatchesSessionId(
  span: OTELSpan,
  sessionId: string
): boolean {
  if (span.attributes) {
    const sessionAttr = span.attributes.find(
      (attr) => attr.key === 'ark.session.id'
    );
    if (sessionAttr?.value?.stringValue === sessionId) {
      return true;
    }
    if (typeof sessionAttr?.value === 'string') {
      return sessionAttr.value === sessionId;
    }
  }
  return false;
}

export interface OTELSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: Array<{
    key: string;
    value: {stringValue?: string; intValue?: number; boolValue?: boolean};
  }>;
  status?: {code?: number; message?: string};
  resource?: Record<string, unknown>;
  [key: string]: unknown;
}

export class TraceBroker {
  private readonly stream: Stream<OTELSpan>;

  constructor(logger: Logger, path?: string, maxItems?: number) {
    this.stream = new InMemoryStream<OTELSpan>(logger, 'Trace', path, maxItems);
  }

  async addSpan(span: OTELSpan): Promise<BrokerItem<OTELSpan>> {
    return this.stream.append(span);
  }

  async addSpans(spans: OTELSpan[]): Promise<BrokerItem<OTELSpan>[]> {
    const items: BrokerItem<OTELSpan>[] = [];
    for (const span of spans) {
      items.push(await this.stream.append(span));
    }
    await this.save();
    return items;
  }

  async getByTraceId(traceId: string): Promise<BrokerItem<OTELSpan>[]> {
    return this.stream.filter((item) => item.data.traceId === traceId);
  }

  async getSpansByTraceId(traceId: string): Promise<OTELSpan[]> {
    return (await this.getByTraceId(traceId)).map((item) => item.data);
  }

  async getTraceIds(): Promise<string[]> {
    const ids = new Set(
      (await this.stream.all()).map((item) => item.data.traceId)
    );
    return Array.from(ids);
  }

  async hasTrace(traceId: string): Promise<boolean> {
    return (
      (await this.stream.filter((item) => item.data.traceId === traceId))
        .length > 0
    );
  }

  all(): Promise<BrokerItem<OTELSpan>[]> {
    return this.stream.all();
  }

  save(): Promise<void> {
    return this.stream.save();
  }

  async delete(): Promise<void> {
    return this.stream.delete();
  }

  subscribe(callback: (item: BrokerItem<OTELSpan>) => void): () => void {
    return this.stream.subscribe(callback);
  }

  subscribeToTrace(
    traceId: string,
    callback: (item: BrokerItem<OTELSpan>) => void
  ): () => void {
    return this.stream.subscribe((item) => {
      if (item.data.traceId === traceId) {
        callback(item);
      }
    });
  }

  async paginateTraces(
    params: PaginationParams,
    sessionId?: string
  ): Promise<PaginatedList<{traceId: string; spans: OTELSpan[]}>> {
    const limit = params.limit ?? DEFAULT_LIMIT;

    let allItems = await this.stream.all();

    if (sessionId) {
      allItems = allItems.filter((item) =>
        spanMatchesSessionId(item.data, sessionId)
      );
    }

    const traceMap = new Map<string, {firstSeq: number; spans: OTELSpan[]}>();

    for (const item of allItems) {
      const existing = traceMap.get(item.data.traceId);
      if (existing) {
        existing.spans.push(item.data);
        existing.firstSeq = Math.min(existing.firstSeq, item.sequenceNumber);
      } else {
        traceMap.set(item.data.traceId, {
          firstSeq: item.sequenceNumber,
          spans: [item.data],
        });
      }
    }

    let traces = Array.from(traceMap.entries())
      .map(([traceId, data]) => ({
        traceId,
        spans: data.spans,
        firstSeq: data.firstSeq,
      }))
      .sort((a, b) => b.firstSeq - a.firstSeq);

    const total = traces.length;

    if (params.cursor !== undefined) {
      traces = traces.filter((t) => t.firstSeq < params.cursor!);
    }

    const items = traces
      .slice(0, limit)
      .map(({traceId, spans}) => ({traceId, spans}));
    const hasMore = traces.length > limit;
    const nextCursor =
      items.length > 0 ? traces[items.length - 1]?.firstSeq : undefined;

    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore ? nextCursor : undefined,
    };
  }

  async paginate(
    params: PaginationParams
  ): Promise<PaginatedList<BrokerItem<OTELSpan>>> {
    return this.stream.paginate(params);
  }

  async getCurrentSequence(): Promise<number> {
    return this.stream.getCurrentSequence();
  }
}
