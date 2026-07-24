import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';
import {OTELSpan} from '../src/brokers/trace-broker.js';
import {EventData} from '../src/brokers/event-broker.js';

const config = loadConfig({});
const logger = createLogger({level: 'silent', pretty: false});
const {
  app,
  brokers: {traces, events},
} = buildApp({
  config,
  logger,
  version: 'test',
  messageStream: createMessageStream(config, logger),
  chunkStream: createChunkStream(config, logger),
  eventStream: createEventStream(config, logger),
});

describe('Session ID Filtering', () => {
  afterEach(async () => {
    await traces.delete();
    await events.delete();
  });

  describe('GET /traces with session_id filter', () => {
    test('should filter traces by session_id in attributes', async () => {
      const span1: OTELSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test-span-1',
        attributes: [
          {key: 'ark.session.id', value: {stringValue: 'session-123'}},
        ],
      };

      const span2: OTELSpan = {
        traceId: 'trace-2',
        spanId: 'span-2',
        name: 'test-span-2',
        attributes: [
          {key: 'ark.session.id', value: {stringValue: 'session-456'}},
        ],
      };

      const span3: OTELSpan = {
        traceId: 'trace-3',
        spanId: 'span-3',
        name: 'test-span-3',
        attributes: [
          {key: 'ark.session.id', value: 'session-123'} as unknown as {
            key: string;
            value: unknown;
          },
        ],
      };

      await traces.addSpan(span1);
      await traces.addSpan(span2);
      await traces.addSpan(span3);

      const response = await request(app).get('/traces?session_id=session-123');

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].traceId).toBe('trace-3');
      expect(response.body.items[1].traceId).toBe('trace-1');
    });

    test('should return all traces when session_id not provided', async () => {
      const span1: OTELSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test-span-1',
        attributes: [
          {key: 'ark.session.id', value: {stringValue: 'session-123'}},
        ],
      };

      const span2: OTELSpan = {
        traceId: 'trace-2',
        spanId: 'span-2',
        name: 'test-span-2',
        attributes: [
          {key: 'ark.session.id', value: {stringValue: 'session-456'}},
        ],
      };

      await traces.addSpan(span1);
      await traces.addSpan(span2);

      const response = await request(app).get('/traces');

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
    });

    test('should return empty array when no traces match session_id', async () => {
      const span1: OTELSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test-span-1',
        attributes: [
          {key: 'ark.session.id', value: {stringValue: 'session-123'}},
        ],
      };

      await traces.addSpan(span1);

      const response = await request(app).get(
        '/traces?session_id=session-nonexistent'
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(0);
    });
  });

  describe('GET /events with session_id filter', () => {
    test('should filter events by session_id', async () => {
      const event1: EventData = {
        timestamp: new Date().toISOString(),
        eventType: 'test',
        reason: 'test',
        message: 'test message 1',
        data: {
          queryId: 'query-1',
          queryName: 'test-query-1',
          queryNamespace: 'default',
          sessionId: 'session-123',
        },
      };

      const event2: EventData = {
        timestamp: new Date().toISOString(),
        eventType: 'test',
        reason: 'test',
        message: 'test message 2',
        data: {
          queryId: 'query-2',
          queryName: 'test-query-2',
          queryNamespace: 'default',
          sessionId: 'session-456',
        },
      };

      await events.addEvent(event1);
      await events.addEvent(event2);

      const response = await request(app).get('/events?session_id=session-123');

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].data.sessionId).toBe('session-123');
    });

    test('should return all events when session_id not provided', async () => {
      const event1: EventData = {
        timestamp: new Date().toISOString(),
        eventType: 'test',
        reason: 'test',
        message: 'test message 1',
        data: {
          queryId: 'query-1',
          queryName: 'test-query-1',
          queryNamespace: 'default',
          sessionId: 'session-123',
        },
      };

      const event2: EventData = {
        timestamp: new Date().toISOString(),
        eventType: 'test',
        reason: 'test',
        message: 'test message 2',
        data: {
          queryId: 'query-2',
          queryName: 'test-query-2',
          queryNamespace: 'default',
          sessionId: 'session-456',
        },
      };

      await events.addEvent(event1);
      await events.addEvent(event2);

      const response = await request(app).get('/events');

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
    });

    test('should return empty array when no events match session_id', async () => {
      const event1: EventData = {
        timestamp: new Date().toISOString(),
        eventType: 'test',
        reason: 'test',
        message: 'test message 1',
        data: {
          queryId: 'query-1',
          queryName: 'test-query-1',
          queryNamespace: 'default',
          sessionId: 'session-123',
        },
      };

      await events.addEvent(event1);

      const response = await request(app).get(
        '/events?session_id=session-nonexistent'
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(0);
    });
  });
});
