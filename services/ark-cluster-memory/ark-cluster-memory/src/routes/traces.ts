import { Router } from 'express';
import { TraceStore } from '../trace-store.js';
import { streamSSE } from '../sse.js';

export function createTracesRouter(traces: TraceStore): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const watch = req.query['watch'] === 'true';

    if (watch) {
      console.log('[TRACES] GET /traces?watch=true - starting SSE stream for all spans');
      streamSSE({
        res,
        req,
        tag: 'TRACES',
        itemName: 'spans',
        subscribe: (callback) => traces.subscribeToAllSpans(callback)
      });
    } else {
      try {
        const allTraces = traces.getAllTraces();
        res.json({
          total_traces: Object.keys(allTraces).length,
          total_spans: traces.getAllSpans().length,
          trace_ids: traces.getTraceIds()
        });
      } catch (error) {
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

    if (watch) {
      console.log(`[TRACES] GET /traces/${trace_id}?watch=true - starting SSE stream`);
      streamSSE({
        res,
        req,
        tag: 'TRACES',
        itemName: 'spans',
        subscribe: (callback) => traces.subscribeToTrace(trace_id, callback),
        replayItems: fromBeginning ? traces.getSpans(trace_id) : undefined,
        identifier: `Trace ${trace_id}`
      });
    } else {
      try {
        const spans = traces.getSpans(trace_id);
        if (spans.length === 0 && !traces.hasTrace(trace_id)) {
          res.status(404).json({ error: 'Trace not found' });
          return;
        }
        res.json({
          trace_id,
          span_count: spans.length,
          spans
        });
      } catch (error) {
        console.error(`[TRACES] Failed to get trace ${trace_id}:`, error);
        const err = error as Error;
        res.status(500).json({ error: err.message });
      }
    }
  });

  router.delete('/', (_req, res) => {
    try {
      traces.purge();
      res.json({ status: 'success', message: 'Trace data purged' });
    } catch (error) {
      console.error('Trace purge failed:', error);
      res.status(500).json({ error: 'Failed to purge trace data' });
    }
  });

  return router;
}
