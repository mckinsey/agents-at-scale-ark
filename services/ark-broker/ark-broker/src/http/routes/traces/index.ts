import {Router} from 'express';
import {TraceBroker} from '@ark-broker/brokers/trace-broker.js';
import {
  sendValidationError,
  sendInternalError,
} from '@ark-broker/http/routes/errors.js';
import {
  getTracesQuerySchema,
  GetTracesQuery,
  GetTracesQueryRaw,
} from './schemas.js';
import {
  handleStreamingAllTraces,
  handlePaginatedAllTraces,
  handleStreamingTrace,
  handlePaginatedTrace,
} from './handlers.js';

export function createTracesRouter(traces: TraceBroker): Router {
  const router = Router();

  router.get<Record<string, string>, unknown, unknown, GetTracesQueryRaw>(
    '/',
    async (req, res) => {
      const parse = getTracesQuerySchema.safeParse(req.query);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id, 'query');
        return;
      }
      const {watch, session_id: sessionId, cursor}: GetTracesQuery = parse.data;

      if (watch) {
        handleStreamingAllTraces(req, res, traces, sessionId, cursor);
      } else {
        await handlePaginatedAllTraces(req, res, traces, sessionId);
      }
    }
  );

  router.get<{trace_id: string}, unknown, unknown, GetTracesQueryRaw>(
    '/:trace_id',
    async (req, res) => {
      const {trace_id} = req.params;
      const parse = getTracesQuerySchema.safeParse(req.query);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id, 'query');
        return;
      }
      const {
        watch,
        cursor,
        'from-beginning': fromBeginning,
      }: GetTracesQuery = parse.data;

      if (watch) {
        handleStreamingTrace(req, res, traces, trace_id, fromBeginning, cursor);
      } else {
        await handlePaginatedTrace(req, res, traces, trace_id);
      }
    }
  );

  router.delete('/', async (req, res) => {
    try {
      await traces.delete();
      res.json({status: 'success', message: 'Trace data purged'});
    } catch (error) {
      req.log.error({err: error}, 'trace purge failed');
      sendInternalError(res, req.id);
    }
  });

  return router;
}
