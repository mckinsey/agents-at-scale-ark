import {Router} from 'express';
import type {Request, Response} from 'express';
import {z} from 'zod';
import {EventBroker, EventData} from '../event-broker.js';
import {SessionsBroker} from '../sessions-broker.js';
import {streamSSE} from '../sse.js';
import {
  parsePaginationParams,
  PaginationError,
  PaginatedList,
} from '../pagination.js';
import {
  sendValidationError,
  sendPaginationError,
  sendInternalError,
} from './errors.js';

const getEventsQuerySchema = z.object({
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
type GetEventsQuery = z.infer<typeof getEventsQuerySchema>;
type GetEventsQueryRaw = {
  watch?: 'true' | 'false';
  session_id?: string;
  cursor?: string;
  'from-beginning'?: 'true' | 'false';
};

const postEventBodySchema = z
  .object({
    data: z.object({queryId: z.string().min(1)}).passthrough(),
  })
  .passthrough();
type PostEventBody = z.infer<typeof postEventBodySchema>;

function handleStreamingAllEvents(
  req: Request,
  res: Response,
  events: EventBroker,
  sessionId: string | undefined,
  cursor: number | undefined
): void {
  req.log.info({cursor, sessionId}, 'starting SSE stream for all events');

  let replayItems: EventData[] | undefined;
  if (cursor !== undefined) {
    let items = events.all().filter((item) => item.sequenceNumber > cursor);
    if (sessionId) {
      items = items.filter((item) => item.data.data.sessionId === sessionId);
    }
    replayItems = items.map((item) => item.data);
  }

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
    replayItems,
  });
}

function handlePaginatedAllEvents(
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

function handleStreamingQueryEvents(
  req: Request,
  res: Response,
  events: EventBroker,
  queryId: string,
  fromBeginning: boolean | undefined,
  cursor: number | undefined
): void {
  req.log.info({queryId}, 'starting SSE stream for query');

  let replayItems: EventData[] | undefined;
  if (fromBeginning) {
    replayItems = events.getEventsByQuery(queryId);
  } else if (cursor !== undefined) {
    replayItems = events
      .getByQuery(queryId)
      .filter((item) => item.sequenceNumber > cursor)
      .map((item) => item.data);
  }

  streamSSE({
    res,
    req,
    logger: req.log,
    tag: 'EVENTS',
    itemName: 'events',
    subscribe: (callback) =>
      events.subscribeToQuery(queryId, (item) => callback(item.data)),
    replayItems,
    identifier: `Query ${queryId}`,
  });
}

function handlePaginatedQueryEvents(
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

export function createEventsRouter(
  events: EventBroker,
  sessions: SessionsBroker
): Router {
  const router = Router();

  router.get<Record<string, string>, unknown, unknown, GetEventsQueryRaw>(
    '/',
    (req, res) => {
      const parse = getEventsQuerySchema.safeParse(req.query);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id, 'query');
        return;
      }
      const {watch, session_id: sessionId, cursor}: GetEventsQuery = parse.data;

      if (watch) {
        handleStreamingAllEvents(req, res, events, sessionId, cursor);
      } else {
        handlePaginatedAllEvents(req, res, events, sessionId);
      }
    }
  );

  router.get<{query_id: string}, unknown, unknown, GetEventsQueryRaw>(
    '/:query_id',
    (req, res) => {
      const {query_id} = req.params;
      const parse = getEventsQuerySchema.safeParse(req.query);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id, 'query');
        return;
      }
      const {
        watch,
        cursor,
        'from-beginning': fromBeginning,
      }: GetEventsQuery = parse.data;

      if (watch) {
        handleStreamingQueryEvents(
          req,
          res,
          events,
          query_id,
          fromBeginning,
          cursor
        );
      } else {
        handlePaginatedQueryEvents(req, res, events, query_id);
      }
    }
  );

  router.post<Record<string, string>, unknown, PostEventBody>(
    '/',
    (req, res) => {
      const parse = postEventBodySchema.safeParse(req.body);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id);
        return;
      }
      const event: PostEventBody = parse.data;

      try {
        events.addEvent(event as unknown as EventData);
        events.save();

        sessions.applyEvent({
          ...event.data,
          _reason: (event as Record<string, unknown>)['reason'] as
            | string
            | undefined,
        });

        res.status(201).json({status: 'success'});
      } catch (error) {
        req.log.error({err: error}, 'failed to add event');
        sendInternalError(res, req.id);
      }
    }
  );

  router.delete('/', (req, res) => {
    try {
      events.delete();
      res.json({status: 'success', message: 'Event data purged'});
    } catch (error) {
      req.log.error({err: error}, 'event purge failed');
      sendInternalError(res, req.id);
    }
  });

  return router;
}
