import {Router} from 'express';
import {EventBroker, EventData} from '@ark-broker/brokers/event-broker.js';
import {SessionsBroker} from '@ark-broker/brokers/sessions-broker.js';
import {
  sendValidationError,
  sendInternalError,
} from '@ark-broker/http/routes/errors.js';
import {
  getEventsQuerySchema,
  GetEventsQuery,
  GetEventsQueryRaw,
  postEventBodySchema,
  PostEventBody,
} from './schemas.js';
import {
  handleStreamingAllEvents,
  handlePaginatedAllEvents,
  handleStreamingQueryEvents,
  handlePaginatedQueryEvents,
} from './handlers.js';

export function createEventsRouter(
  events: EventBroker,
  sessions: SessionsBroker
): Router {
  const router = Router();

  router.get<Record<string, string>, unknown, unknown, GetEventsQueryRaw>(
    '/',
    async (req, res) => {
      const parse = getEventsQuerySchema.safeParse(req.query);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id, 'query');
        return;
      }
      const {watch, session_id: sessionId, cursor}: GetEventsQuery = parse.data;

      if (watch) {
        handleStreamingAllEvents(req, res, events, sessionId, cursor);
      } else {
        await handlePaginatedAllEvents(req, res, events, sessionId);
      }
    }
  );

  router.get<{query_id: string}, unknown, unknown, GetEventsQueryRaw>(
    '/:query_id',
    async (req, res) => {
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
        await handlePaginatedQueryEvents(req, res, events, query_id);
      }
    }
  );

  router.post<Record<string, string>, unknown, PostEventBody>(
    '/',
    async (req, res) => {
      const parse = postEventBodySchema.safeParse(req.body);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id);
        return;
      }
      const {ttl_seconds: ttlSeconds, ...event}: PostEventBody = parse.data;

      try {
        await events.addEvent(event as unknown as EventData, ttlSeconds);
        await events.save();

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

  router.delete('/', async (req, res) => {
    try {
      await events.delete();
      res.json({status: 'success', message: 'Event data purged'});
    } catch (error) {
      req.log.error({err: error}, 'event purge failed');
      sendInternalError(res, req.id);
    }
  });

  return router;
}
