import { Router } from 'express';
import type { Request, Response } from 'express';
import { SessionsBroker } from '../sessions-broker.js';
import { streamSSE } from '../sse.js';
import type { SessionEventData } from '../types.js';
import { parsePaginationParams, PaginationError } from '../pagination.js';

function handleStreamingSessions(req: Request, res: Response, sessionsBroker: SessionsBroker) {
  const filterSessionId = req.query['session_id'] as string | undefined;

  const store = sessionsBroker.getAll();
  let initialSessions = store.sessions;
  if (filterSessionId) {
    initialSessions = store.sessions[filterSessionId]
      ? { [filterSessionId]: store.sessions[filterSessionId] }
      : {};
  }
  const replayItems = Object.entries(initialSessions).map(([sid, session]) => ({ sessionId: sid, session }));

  streamSSE({
    res,
    req,
    tag: 'SESSIONS',
    itemName: 'sessions',
    subscribe: (callback) => sessionsBroker.subscribe(({ sessionId }) => {
      if (filterSessionId && sessionId !== filterSessionId) return;
      const updated = sessionsBroker.getSession(sessionId);
      if (updated) callback({ sessionId, session: updated });
    }),
    replayItems,
  });
}

function handlePaginatedSessions(req: Request, res: Response, sessionsBroker: SessionsBroker) {
  const params = parsePaginationParams(req.query as Record<string, unknown>);

  const filters = {
    status: req.query['status'] as 'active' | 'idle' | 'error' | undefined,
    dateFrom: req.query['dateFrom'] as string | undefined,
    dateTo: req.query['dateTo'] as string | undefined,
    search: req.query['search'] as string | undefined,
  };

  const sort = req.query['sort'] ? {
    field: req.query['sort'] as 'date' | 'name' | 'conversations',
    direction: (req.query['order'] || 'desc') as 'asc' | 'desc',
  } : undefined;

  const result = sessionsBroker.paginate(params, filters, sort);
  res.json(result);
}

export function createSessionsRouter(sessionsBroker: SessionsBroker): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const watch = req.query['watch'] === 'true';

    if (watch) {
      handleStreamingSessions(req, res, sessionsBroker);
      return;
    }

    try {
      const hasPaginationParams = req.query['limit'] || req.query['cursor'];

      if (hasPaginationParams) {
        handlePaginatedSessions(req, res, sessionsBroker);
      } else {
        const store = sessionsBroker.getAll();
        res.json(store);
      }
    } catch (error) {
      if (error instanceof PaginationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('[SESSIONS] Failed to get sessions:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:session_id', (req, res) => {
    try {
      const { session_id } = req.params;
      const session = sessionsBroker.getSession(session_id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json(session);
    } catch (error) {
      console.error('[SESSIONS] Failed to get session:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  /** Receives event data to apply to the sessions store */
  router.post('/', (req, res) => {
    try {
      const data = req.body as SessionEventData;
      if (!data.sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      sessionsBroker.applyEvent(data);
      sessionsBroker.save();
      res.status(201).json({ status: 'success' });
    } catch (error) {
      console.error('[SESSIONS] Failed to ingest:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/', (_req, res) => {
    try {
      sessionsBroker.delete();
      res.json({ status: 'success', message: 'Sessions purged' });
    } catch (error) {
      console.error('[SESSIONS] Purge failed:', error);
      res.status(500).json({ error: 'Failed to purge sessions' });
    }
  });

  return router;
}
