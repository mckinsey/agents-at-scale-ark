import {Router} from 'express';
import type {Request, Response} from 'express';
import {z} from 'zod';
import {SessionsBroker} from '../sessions-broker.js';
import {streamSSE} from '../sse.js';
import type {SessionEventData} from '../types.js';
import {parsePaginationParams, PaginationError} from '../pagination.js';

const getSessionsQuerySchema = z.object({
  watch: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  session_id: z.string().optional(),
  status: z.enum(['active', 'idle', 'error']).optional(),
  sort: z.enum(['date', 'name', 'conversations']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});
type GetSessionsQuery = z.infer<typeof getSessionsQuerySchema>;
type GetSessionsQueryRaw = {
  watch?: 'true' | 'false';
  session_id?: string;
  status?: 'active' | 'idle' | 'error';
  sort?: 'date' | 'name' | 'conversations';
  order?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: string;
  cursor?: string;
};

const postSessionEventBodySchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .passthrough();
type PostSessionEventBody = z.infer<typeof postSessionEventBodySchema>;

function handleStreamingSessions(
  req: Request,
  res: Response,
  sessionsBroker: SessionsBroker,
  filterSessionId: string | undefined
): void {
  const store = sessionsBroker.getAll();
  let initialSessions = store.sessions;
  if (filterSessionId) {
    initialSessions = store.sessions[filterSessionId]
      ? {[filterSessionId]: store.sessions[filterSessionId]}
      : {};
  }
  const replayItems = Object.entries(initialSessions).map(([sid, session]) => ({
    sessionId: sid,
    session,
  }));

  streamSSE({
    res,
    req,
    logger: req.log,
    tag: 'SESSIONS',
    itemName: 'sessions',
    subscribe: (callback) =>
      sessionsBroker.subscribe(({sessionId}) => {
        if (filterSessionId && sessionId !== filterSessionId) return;
        const updated = sessionsBroker.getSession(sessionId);
        if (updated) callback({sessionId, session: updated});
      }),
    replayItems,
  });
}

function handlePaginatedSessions(
  req: Request,
  res: Response,
  sessionsBroker: SessionsBroker,
  query: GetSessionsQuery
): void {
  const params = parsePaginationParams(req.query as Record<string, unknown>);

  const filters = {
    status: query.status,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    search: query.search,
  };

  const sort = query.sort
    ? {
        field: query.sort,
        direction: query.order ?? ('desc' as const),
      }
    : undefined;

  const result = sessionsBroker.paginate(params, filters, sort);
  res.json(result);
}

export function createSessionsRouter(sessionsBroker: SessionsBroker): Router {
  const router = Router();

  router.get<Record<string, string>, unknown, unknown, GetSessionsQueryRaw>(
    '/',
    (req, res) => {
      const parse = getSessionsQuerySchema.safeParse(req.query);
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
      const query: GetSessionsQuery = parse.data;

      if (query.watch) {
        handleStreamingSessions(req, res, sessionsBroker, query.session_id);
        return;
      }

      try {
        const hasPaginationParams = req.query['limit'] || req.query['cursor'];

        if (hasPaginationParams) {
          handlePaginatedSessions(req, res, sessionsBroker, query);
        } else {
          const store = sessionsBroker.getAll();
          res.json(store);
        }
      } catch (error) {
        if (error instanceof PaginationError) {
          res.status(400).json({error: error.message});
          return;
        }
        req.log.error({err: error}, 'failed to get sessions');
        const err = error as Error;
        res.status(500).json({error: err.message});
      }
    }
  );

  router.get<{session_id: string}>('/:session_id', (req, res) => {
    try {
      const {session_id} = req.params;
      const session = sessionsBroker.getSession(session_id);
      if (!session) {
        res.status(404).json({error: 'Session not found'});
        return;
      }
      res.json(session);
    } catch (error) {
      req.log.error({err: error}, 'failed to get session');
      const err = error as Error;
      res.status(500).json({error: err.message});
    }
  });

  /** Receives event data to apply to the sessions store */
  router.post<Record<string, string>, unknown, PostSessionEventBody>(
    '/',
    (req, res) => {
      const parse = postSessionEventBodySchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parse.error.issues
              .map((e) => `${e.path.join('.') || 'body'}: ${e.message}`)
              .join('; '),
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }
      const data: PostSessionEventBody = parse.data;

      try {
        sessionsBroker.applyEvent(data as unknown as SessionEventData);
        sessionsBroker.save();
        res.status(201).json({status: 'success'});
      } catch (error) {
        req.log.error({err: error}, 'failed to ingest');
        const err = error as Error;
        res.status(500).json({error: err.message});
      }
    }
  );

  router.delete('/', (req, res) => {
    try {
      sessionsBroker.delete();
      res.json({status: 'success', message: 'Sessions purged'});
    } catch (error) {
      req.log.error({err: error}, 'purge failed');
      res.status(500).json({error: 'Failed to purge sessions'});
    }
  });

  return router;
}
