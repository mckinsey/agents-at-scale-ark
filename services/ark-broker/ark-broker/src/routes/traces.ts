import { Router } from 'express';
import { TraceBroker, OTELSpan } from '../trace-broker.js';
import { streamSSE } from '../sse.js';
import { parsePaginationParams, PaginationError, PaginatedList } from '../pagination.js';

export function createTracesRouter(traces: TraceBroker): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const watch = req.query['watch'] === 'true';

    if (watch) {
      const cursor = req.query['cursor'] ? parseInt(req.query['cursor'] as string, 10) : undefined;
      console.log(`[TRACES] GET /traces?watch=true${cursor ? `&cursor=${cursor}` : ''} - starting SSE stream for all spans`);

      let replayItems: OTELSpan[] | undefined;
      if (cursor !== undefined && !isNaN(cursor)) {
        replayItems = traces.all()
          .filter(item => item.sequenceNumber > cursor)
          .map(item => item.data);
      }

      streamSSE({
        res,
        req,
        tag: 'TRACES',
        itemName: 'spans',
        subscribe: (callback) => traces.subscribe((item) => callback(item.data)),
        replayItems
      });
    } else {
      try {
        const params = parsePaginationParams(req.query as Record<string, unknown>);
        const result = traces.paginateTraces(params);

        const response: PaginatedList<{ traceId: string; spans: OTELSpan[] }> = {
          items: result.items,
          total: result.total,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor
        };

        res.json(response);
      } catch (error) {
        if (error instanceof PaginationError) {
          res.status(400).json({ error: error.message });
          return;
        }
        console.error('[TRACES] Failed to get traces:', error);
        const err = error as Error;
        res.status(500).json({ error: err.message });
      }
    }
  });

  router.get('/:trace_id', (req, res) => {
    const { trace_id } = req.params;
    const watch = req.query['watch'] === 'true';
    const fromBeginning = req.query['from-beginning'] === 'true';
    const cursor = req.query['cursor'] ? parseInt(req.query['cursor'] as string, 10) : undefined;

    if (watch) {
      console.log(`[TRACES] GET /traces/${trace_id}?watch=true - starting SSE stream`);

      let replayItems: OTELSpan[] | undefined;
      if (fromBeginning) {
        replayItems = traces.getSpansByTraceId(trace_id);
      } else if (cursor !== undefined && !isNaN(cursor)) {
        replayItems = traces.getByTraceId(trace_id)
          .filter(item => item.sequenceNumber > cursor)
          .map(item => item.data);
      }

      streamSSE({
        res,
        req,
        tag: 'TRACES',
        itemName: 'spans',
        subscribe: (callback) => traces.subscribeToTrace(trace_id, (item) => callback(item.data)),
        replayItems,
        identifier: `Trace ${trace_id}`
      });
    } else {
      try {
        const spans = traces.getSpansByTraceId(trace_id);
        if (spans.length === 0 && !traces.hasTrace(trace_id)) {
          res.status(404).json({ error: 'Trace not found' });
          return;
        }
        res.json({ traceId: trace_id, spans });
      } catch (error) {
        console.error(`[TRACES] Failed to get trace ${trace_id}:`, error);
        const err = error as Error;
        res.status(500).json({ error: err.message });
      }
    }
  });

  router.delete('/', (_req, res) => {
    try {
      traces.delete();
      res.json({ status: 'success', message: 'Trace data purged' });
    } catch (error) {
      console.error('Trace purge failed:', error);
      res.status(500).json({ error: 'Failed to purge trace data' });
    }
  });

  return router;
}
