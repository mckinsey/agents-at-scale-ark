import type {Request, Response} from 'express';
import {SessionsBroker} from '@ark-broker/brokers/sessions-broker.js';
import {streamSSE} from '@ark-broker/http/sse.js';
import {parsePaginationParams} from '@ark-broker/brokers/pagination.js';
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
        void sessionsBroker.getSession(sessionId).then((updated) => {
          if (updated) callback({sessionId, session: updated});
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
