import { Router } from 'express';
import { EventBroker, EventData } from '../event-broker.js';
import { streamSSE } from '../sse.js';
import { parsePaginationParams, PaginationError, PaginatedList } from '../pagination.js';

export function createEventsRouter(events: EventBroker): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const watch = req.query['watch'] === 'true';

    if (watch) {
      const cursor = req.query['cursor'] ? parseInt(req.query['cursor'] as string, 10) : undefined;
      console.log(`[EVENTS] GET /events?watch=true${cursor ? `&cursor=${cursor}` : ''} - starting SSE stream for all events`);

      let replayItems: EventData[] | undefined;
      if (cursor !== undefined && !isNaN(cursor)) {
        replayItems = events.all()
          .filter(item => item.sequenceNumber > cursor)
          .map(item => item.data);
      }

      streamSSE({
        res,
        req,
        tag: 'EVENTS',
        itemName: 'events',
        subscribe: (callback) => events.subscribe((item) => callback(item.data)),
        replayItems
      });
    } else {
      try {
        const params = parsePaginationParams(req.query as Record<string, unknown>);
        const result = events.paginate(params);

        const response: PaginatedList<EventData> = {
          items: result.items.map(item => item.data),
          total: result.total,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor
        };

        res.json(response);
      } catch (error) {
        if (error instanceof PaginationError) {
          res.status(400).json({ error: error.message });
          return;
        }
        console.error('[EVENTS] Failed to get events:', error);
        const err = error as Error;
        res.status(500).json({ error: err.message });
      }
    }
  });

  router.get('/:query_id', (req, res) => {
    const { query_id } = req.params;
    const watch = req.query['watch'] === 'true';
    const fromBeginning = req.query['from-beginning'] === 'true';
    const cursor = req.query['cursor'] ? parseInt(req.query['cursor'] as string, 10) : undefined;

    if (watch) {
      console.log(`[EVENTS] GET /events/${query_id}?watch=true - starting SSE stream`);

      let replayItems: EventData[] | undefined;
      if (fromBeginning) {
        replayItems = events.getEventsByQuery(query_id);
      } else if (cursor !== undefined && !isNaN(cursor)) {
        replayItems = events.getByQuery(query_id)
          .filter(item => item.sequenceNumber > cursor)
          .map(item => item.data);
      }

      streamSSE({
        res,
        req,
        tag: 'EVENTS',
        itemName: 'events',
        subscribe: (callback) => events.subscribeToQuery(query_id, (item) => callback(item.data)),
        replayItems,
        identifier: `Query ${query_id}`
      });
    } else {
      try {
        const params = parsePaginationParams(req.query as Record<string, unknown>);
        const result = events.paginateByQuery(query_id, params);

        const response: PaginatedList<EventData> = {
          items: result.items.map(item => item.data),
          total: result.total,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor
        };

        res.json(response);
      } catch (error) {
        if (error instanceof PaginationError) {
          res.status(400).json({ error: error.message });
          return;
        }
        console.error(`[EVENTS] Failed to get events for query ${query_id}:`, error);
        const err = error as Error;
        res.status(500).json({ error: err.message });
      }
    }
  });

  router.post('/', (req, res) => {
    try {
      const event = req.body;
      if (!event || !event.data || !event.data.queryId) {
        res.status(400).json({ error: 'Invalid event - data.queryId is required' });
        return;
      }
      events.addEvent(event as EventData);
      events.save();
      res.status(201).json({ status: 'success' });
    } catch (error) {
      console.error('[EVENTS] Failed to add event:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/', (_req, res) => {
    try {
      events.delete();
      res.json({ status: 'success', message: 'Event data purged' });
    } catch (error) {
      console.error('Event purge failed:', error);
      res.status(500).json({ error: 'Failed to purge event data' });
    }
  });

  return router;
}
