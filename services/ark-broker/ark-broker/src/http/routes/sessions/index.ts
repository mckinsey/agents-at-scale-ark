import {Router} from 'express';
import {SessionsBroker} from '@ark-broker/brokers/sessions-broker.js';
import type {SessionEventData} from '@ark-broker/brokers/sessions-broker.js';
import {
  sendValidationError,
  sendPaginationError,
  sendInternalError,
} from '@ark-broker/http/routes/errors.js';
import {PaginationError} from '@ark-broker/brokers/pagination.js';
import {
  getSessionsQuerySchema,
  GetSessionsQuery,
  GetSessionsQueryRaw,
  postSessionEventBodySchema,
  PostSessionEventBody,
} from './schemas.js';
import {handleStreamingSessions, handlePaginatedSessions} from './handlers.js';

export function createSessionsRouter(sessionsBroker: SessionsBroker): Router {
  const router = Router();

  router.get<Record<string, string>, unknown, unknown, GetSessionsQueryRaw>(
    '/',
    (req, res) => {
      const parse = getSessionsQuerySchema.safeParse(req.query);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id, 'query');
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
          sendPaginationError(res, error, req.id);
          return;
        }
        req.log.error({err: error}, 'failed to get sessions');
        sendInternalError(res, req.id);
      }
    }
  );

  router.get<{session_id: string}>('/:session_id', (req, res) => {
    try {
      const {session_id} = req.params;
      const session = sessionsBroker.getSession(session_id);
      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }
      res.json(session);
    } catch (error) {
      req.log.error({err: error}, 'failed to get session');
      sendInternalError(res, req.id);
    }
  });

  router.post<Record<string, string>, unknown, PostSessionEventBody>(
    '/',
    (req, res) => {
      const parse = postSessionEventBodySchema.safeParse(req.body);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id);
        return;
      }
      const data: PostSessionEventBody = parse.data;

      try {
        sessionsBroker.applyEvent(data as unknown as SessionEventData);
        sessionsBroker.save();
        res.status(201).json({status: 'success'});
      } catch (error) {
        req.log.error({err: error}, 'failed to ingest');
        sendInternalError(res, req.id);
      }
    }
  );

  router.delete('/', (req, res) => {
    try {
      sessionsBroker.delete();
      res.json({status: 'success', message: 'Sessions purged'});
    } catch (error) {
      req.log.error({err: error}, 'purge failed');
      sendInternalError(res, req.id);
    }
  });

  return router;
}
