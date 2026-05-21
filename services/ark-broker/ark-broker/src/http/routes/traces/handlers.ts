import type {Request, Response} from 'express';
import {
  TraceBroker,
  OTELSpan,
  spanMatchesSessionId,
} from '@ark-broker/brokers/trace-broker.js';
import {streamSSE} from '@ark-broker/http/sse.js';
import {
  parsePaginationParams,
  PaginationError,
  PaginatedList,
} from '@ark-broker/brokers/pagination.js';
import {
  sendPaginationError,
  sendInternalError,
} from '@ark-broker/http/routes/errors.js';

export function handleStreamingAllTraces(
  req: Request,
  res: Response,
  traces: TraceBroker,
  sessionId: string | undefined,
  cursor: number | undefined
): void {
  req.log.info({cursor, sessionId}, 'starting SSE stream for all spans');

  let replayItems: OTELSpan[] | undefined;
  if (cursor !== undefined) {
    let items = traces.all().filter((item) => item.sequenceNumber > cursor);
    if (sessionId) {
      items = items.filter((item) =>
        spanMatchesSessionId(item.data, sessionId)
      );
    }
    replayItems = items.map((item) => item.data);
  }

  streamSSE({
    res,
    req,
    logger: req.log,
    tag: 'TRACES',
    itemName: 'spans',
    subscribe: (callback) =>
      traces.subscribe((item) => {
        if (!sessionId || spanMatchesSessionId(item.data, sessionId)) {
          callback(item.data);
        }
      }),
    replayItems,
  });
}

export function handlePaginatedAllTraces(
  req: Request,
  res: Response,
  traces: TraceBroker,
  sessionId: string | undefined
): void {
  try {
    const params = parsePaginationParams(req.query as Record<string, unknown>);
    const result = traces.paginateTraces(params, sessionId);

    const response: PaginatedList<{traceId: string; spans: OTELSpan[]}> = {
      items: result.items,
      total: result.total,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };

    res.json(response);
  } catch (error) {
    if (error instanceof PaginationError) {
      sendPaginationError(res, error, req.id);
      return;
    }
    req.log.error({err: error}, 'failed to get traces');
    sendInternalError(res, req.id);
  }
}

export function handleStreamingTrace(
  req: Request,
  res: Response,
  traces: TraceBroker,
  traceId: string,
  fromBeginning: boolean | undefined,
  cursor: number | undefined
): void {
  req.log.info({traceId}, 'starting SSE stream for trace');

  let replayItems: OTELSpan[] | undefined;
  if (fromBeginning) {
    replayItems = traces.getSpansByTraceId(traceId);
  } else if (cursor !== undefined) {
    replayItems = traces
      .getByTraceId(traceId)
      .filter((item) => item.sequenceNumber > cursor)
      .map((item) => item.data);
  }

  streamSSE({
    res,
    req,
    logger: req.log,
    tag: 'TRACES',
    itemName: 'spans',
    subscribe: (callback) =>
      traces.subscribeToTrace(traceId, (item) => callback(item.data)),
    replayItems,
    identifier: `Trace ${traceId}`,
  });
}

export function handlePaginatedTrace(
  req: Request,
  res: Response,
  traces: TraceBroker,
  traceId: string
): void {
  try {
    const spans = traces.getSpansByTraceId(traceId);
    if (spans.length === 0 && !traces.hasTrace(traceId)) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Trace not found',
          requestId: req.id === undefined ? undefined : String(req.id),
        },
      });
      return;
    }
    res.json({traceId, spans});
  } catch (error) {
    req.log.error({err: error, traceId}, 'failed to get trace');
    sendInternalError(res, req.id);
  }
}
