import {Router} from 'express';
import {z} from 'zod';
import {TraceBroker, OTELSpan} from '../trace-broker.js';
import {streamSSE} from '../sse.js';
import {
  parsePaginationParams,
  PaginationError,
  PaginatedList,
} from '../pagination.js';

const getTracesQuerySchema = z.object({
  watch: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  session_id: z.string().optional(),
  cursor: z.coerce.number().int().nonnegative().optional(),
  'from-beginning': z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type GetTracesQuery = z.infer<typeof getTracesQuerySchema>;
type GetTracesQueryRaw = {
  watch?: 'true' | 'false';
  session_id?: string;
  cursor?: string;
  'from-beginning'?: 'true' | 'false';
};

/**
 * Check if a span matches a session ID.
 * @param span - The span to check.
 * @param sessionId - The session ID to check against.
 * @returns True if the span matches the session ID, false otherwise.
 */
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

export function createTracesRouter(traces: TraceBroker): Router {
  const router = Router();

  router.get<Record<string, string>, unknown, unknown, GetTracesQueryRaw>(
    '/',
    (req, res) => {
      const parse = getTracesQuerySchema.safeParse(req.query);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parse.error.issues
              .map((e) => `${e.path.join('.') || 'query'}: ${e.message}`)
              .join('; '),
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }
      const {watch, session_id: sessionId, cursor}: GetTracesQuery = parse.data;

      if (watch) {
        req.log.info({cursor, sessionId}, 'starting SSE stream for all spans');

        let replayItems: OTELSpan[] | undefined;
        if (cursor !== undefined) {
          let items = traces
            .all()
            .filter((item) => item.sequenceNumber > cursor);
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
      } else {
        try {
          const params = parsePaginationParams(
            req.query as Record<string, unknown>
          );
          const result = traces.paginateTraces(params, sessionId);

          const response: PaginatedList<{traceId: string; spans: OTELSpan[]}> =
            {
              items: result.items,
              total: result.total,
              hasMore: result.hasMore,
              nextCursor: result.nextCursor,
            };

          res.json(response);
        } catch (error) {
          if (error instanceof PaginationError) {
            res.status(400).json({
              error: {
                code: 'PAGINATION_ERROR',
                message: error.message,
                requestId: req.id === undefined ? undefined : String(req.id),
              },
            });
            return;
          }
          req.log.error({err: error}, 'failed to get traces');
          res.status(500).json({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal server error',
              requestId: req.id === undefined ? undefined : String(req.id),
            },
          });
        }
      }
    }
  );

  router.get<{trace_id: string}, unknown, unknown, GetTracesQueryRaw>(
    '/:trace_id',
    (req, res) => {
      const {trace_id} = req.params;
      const parse = getTracesQuerySchema.safeParse(req.query);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parse.error.issues
              .map((e) => `${e.path.join('.') || 'query'}: ${e.message}`)
              .join('; '),
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }
      const {
        watch,
        cursor,
        'from-beginning': fromBeginning,
      }: GetTracesQuery = parse.data;

      if (watch) {
        req.log.info({traceId: trace_id}, 'starting SSE stream for trace');

        let replayItems: OTELSpan[] | undefined;
        if (fromBeginning) {
          replayItems = traces.getSpansByTraceId(trace_id);
        } else if (cursor !== undefined) {
          replayItems = traces
            .getByTraceId(trace_id)
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
            traces.subscribeToTrace(trace_id, (item) => callback(item.data)),
          replayItems,
          identifier: `Trace ${trace_id}`,
        });
      } else {
        try {
          const spans = traces.getSpansByTraceId(trace_id);
          if (spans.length === 0 && !traces.hasTrace(trace_id)) {
            res.status(404).json({
              error: {
                code: 'NOT_FOUND',
                message: 'Trace not found',
                requestId: req.id === undefined ? undefined : String(req.id),
              },
            });
            return;
          }
          res.json({traceId: trace_id, spans});
        } catch (error) {
          req.log.error({err: error, traceId: trace_id}, 'failed to get trace');
          res.status(500).json({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal server error',
              requestId: req.id === undefined ? undefined : String(req.id),
            },
          });
        }
      }
    }
  );

  router.delete('/', (req, res) => {
    try {
      traces.delete();
      res.json({status: 'success', message: 'Trace data purged'});
    } catch (error) {
      req.log.error({err: error}, 'trace purge failed');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          requestId: req.id === undefined ? undefined : String(req.id),
        },
      });
    }
  });

  return router;
}
