import type {Request, Response} from 'express';
import {EventBroker, EventData} from '@ark-broker/brokers/event-broker.js';
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

export function handleStreamingAllEvents(
  req: Request,
  res: Response,
  events: EventBroker,
  sessionId: string | undefined,
  cursor: number | undefined
): void {
  req.log.info({cursor, sessionId}, 'starting SSE stream for all events');

  const getReplay =
    cursor !== undefined
      ? (): Promise<EventData[]> => {
          let items = events
            .all()
            .filter((item) => item.sequenceNumber > cursor);
          if (sessionId) {
            items = items.filter(
              (item) => item.data.data.sessionId === sessionId
            );
          }
          return Promise.resolve(items.map((item) => item.data));
        }
      : undefined;

  streamSSE({
    res,
    req,
    logger: req.log,
    tag: 'EVENTS',
    itemName: 'events',
    subscribe: (callback) =>
      events.subscribe((item) => {
        if (!sessionId || item.data.data.sessionId === sessionId) {
          callback(item.data);
        }
      }),
    getReplay,
  });
}

export function handlePaginatedAllEvents(
  req: Request,
  res: Response,
  events: EventBroker,
  sessionId: string | undefined
): void {
  try {
    const params = parsePaginationParams(req.query as Record<string, unknown>);
    const result = sessionId
      ? events.paginateBySessionId(sessionId, params)
      : events.paginate(params);

    const response: PaginatedList<EventData> = {
      items: result.items.map((item) => item.data),
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
    req.log.error({err: error}, 'failed to get events');
    sendInternalError(res, req.id);
  }
}

export function handleStreamingQueryEvents(
  req: Request,
  res: Response,
  events: EventBroker,
  queryId: string,
  fromBeginning: boolean | undefined,
  cursor: number | undefined
): void {
  req.log.info({queryId}, 'starting SSE stream for query');

  const getReplay =
    fromBeginning || cursor !== undefined
      ? (): Promise<EventData[]> => {
          if (fromBeginning) {
            return Promise.resolve(events.getEventsByQuery(queryId));
          }
          return Promise.resolve(
            events
              .getByQuery(queryId)
              .filter((item) => item.sequenceNumber > cursor!)
              .map((item) => item.data)
          );
        }
      : undefined;

  streamSSE({
    res,
    req,
    logger: req.log,
    tag: 'EVENTS',
    itemName: 'events',
    subscribe: (callback) =>
      events.subscribeToQuery(queryId, (item) => callback(item.data)),
    getReplay,
    identifier: `Query ${queryId}`,
  });
}

export function handlePaginatedQueryEvents(
  req: Request,
  res: Response,
  events: EventBroker,
  queryId: string
): void {
  try {
    const params = parsePaginationParams(req.query as Record<string, unknown>);
    const result = events.paginateByQuery(queryId, params);

    const response: PaginatedList<EventData> = {
      items: result.items.map((item) => item.data),
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
    req.log.error({err: error, queryId}, 'failed to get events for query');
    sendInternalError(res, req.id);
  }
}
