import type {Request, Response} from 'express';
import {SessionsBroker} from '@ark-broker/brokers/sessions-broker.js';
import {streamSSE} from '@ark-broker/http/sse.js';
import {parsePaginationParams} from '@ark-broker/brokers/pagination.js';
import {sendInternalError} from '@ark-broker/http/routes/errors.js';
import {GetSessionsQuery} from './schemas.js';

export function handleStreamingSessions(
  req: Request,
  res: Response,
  sessionsBroker: SessionsBroker,
  filterSessionId: string | undefined
): void {
  streamSSE({
    res,
    req,
    logger: req.log,
    tag: 'SESSIONS',
    itemName: 'sessions',
    subscribe: (callback) =>
      sessionsBroker.subscribe(({sessionId}) => {
        if (filterSessionId && sessionId !== filterSessionId) return;
        void sessionsBroker
          .getSession(sessionId)
          .then((updated) => {
            if (updated) callback({sessionId, session: updated});
          })
          .catch((err) => {
            req.log.error({err, sessionId}, 'failed to read updated session');
          });
      }),
    getReplay: async (): Promise<unknown[]> => {
      const store = await sessionsBroker.getAll();
      let initialSessions = store.sessions;
      if (filterSessionId) {
        initialSessions = store.sessions[filterSessionId]
          ? {[filterSessionId]: store.sessions[filterSessionId]}
          : {};
      }
      return Object.entries(initialSessions).map(([sid, session]) => ({
        sessionId: sid,
        session,
      }));
    },
  });
}

export async function handlePaginatedSessions(
  req: Request,
  res: Response,
  sessionsBroker: SessionsBroker,
  query: GetSessionsQuery
): Promise<void> {
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

  const result = await sessionsBroker.paginate(params, filters, sort);
  res.json(result);
}

export async function handleDeleteSessionQuery(
  req: Request<{query_id: string}>,
  res: Response,
  sessionsBroker: SessionsBroker
): Promise<void> {
  const queryId = req.params.query_id;
  try {
    req.log.info({queryId}, 'deleting query from sessions');
    const removed = await sessionsBroker.deleteQuery(queryId);
    // The in-memory backend only arms a debounced write; every other mutating
    // sessions route flushes, and without it a kill inside that window reloads
    // the query this call removed.
    await sessionsBroker.save();
    // 200 even when nothing matched: the controller reads 404 as "this broker
    // does not implement the route" and skips, which would hide a real failure.
    // A query that never emitted an event legitimately has no row.
    res.json({
      status: 'success',
      message: `Query ${queryId} removed from ${removed} session(s)`,
      removed,
    });
  } catch (error) {
    req.log.error({err: error}, 'failed to delete query from sessions');
    sendInternalError(res, req.id);
  }
}
