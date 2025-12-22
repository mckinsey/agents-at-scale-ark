import { Router } from 'express';
import { EventStore } from '../event-store.js';
import { streamSSE } from '../sse.js';

export function createEventsRouter(events: EventStore): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const watch = req.query['watch'] === 'true';

    if (watch) {
      console.log('[EVENTS] GET /events?watch=true - starting SSE stream for all events');
      streamSSE({
        res,
        req,
        tag: 'EVENTS',
        itemName: 'events',
        subscribe: (callback) => events.subscribeToAll(callback)
      });
    } else {
      try {
        const allEvents = events.getEvents();
        res.json({
          total_events: allEvents.length,
          events: allEvents
        });
      } catch (error) {
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

    if (watch) {
      console.log(`[EVENTS] GET /events/${query_id}?watch=true - starting SSE stream`);
      streamSSE({
        res,
        req,
        tag: 'EVENTS',
        itemName: 'events',
        subscribe: (callback) => events.subscribeToQuery(query_id, callback),
        replayItems: fromBeginning ? events.getEventsByQuery(query_id) : undefined,
        identifier: `Query ${query_id}`
      });
    } else {
      try {
        const queryEvents = events.getEventsByQuery(query_id);
        res.json({
          query_id,
          event_count: queryEvents.length,
          events: queryEvents
        });
      } catch (error) {
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
        res.status(400).json({ error: 'Invalid event' });
        return;
      }
      events.addEvent(event);
      res.status(201).json({ status: 'success' });
    } catch (error) {
      console.error('[EVENTS] Failed to add event:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/', (_req, res) => {
    try {
      events.purge();
      res.json({ status: 'success', message: 'Event data purged' });
    } catch (error) {
      console.error('Event purge failed:', error);
      res.status(500).json({ error: 'Failed to purge event data' });
    }
  });

  return router;
}
