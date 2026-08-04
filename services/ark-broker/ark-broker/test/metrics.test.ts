import request from 'supertest';
import type {Express} from 'express';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';
import {createMetricsRegistry} from '../src/metrics/registry.js';

const logger = createLogger({level: 'silent', pretty: false});

function buildMemoryBackedApp(): Express {
  const config = loadConfig({});
  return buildApp({
    config,
    logger,
    version: 'test',
    messageStream: createMessageStream(config, logger),
    chunkStream: createChunkStream(config, logger),
    eventStream: createEventStream(config, logger),
  }).app;
}

function sampleValue(body: string, metric: string): number | undefined {
  const line = body
    .split('\n')
    .find((l) => l.startsWith(`${metric} `) || l === metric);
  return line === undefined ? undefined : Number(line.split(' ')[1]);
}

describe('GET /metrics', () => {
  const app = buildMemoryBackedApp();

  test('exposes the prometheus exposition format', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# TYPE broker_messages_count gauge');
  });

  test('exposes default node process metrics', async () => {
    const response = await request(app).get('/metrics');

    expect(response.text).toContain('process_resident_memory_bytes');
    expect(response.text).toContain('nodejs_heap_size_used_bytes');
  });

  test('registers a gauge for every in-memory cache', async () => {
    const response = await request(app).get('/metrics');

    for (const metric of [
      'broker_messages_count',
      'broker_chunks_count',
      'broker_spans_count',
      'broker_events_count',
    ]) {
      expect(sampleValue(response.text, metric)).toBeDefined();
    }
  });

  test('tracks cache growth as items are stored', async () => {
    const before = sampleValue(
      (await request(app).get('/metrics')).text,
      'broker_messages_count'
    );

    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'metrics-conversation',
        query_id: 'metrics-query',
        messages: [{role: 'user', content: 'hello'}],
      });

    const after = sampleValue(
      (await request(app).get('/metrics')).text,
      'broker_messages_count'
    );

    expect(after).toBe(before! + 1);
  });
});

describe('createMetricsRegistry', () => {
  test('omits gauges for stores with no in-process cache', async () => {
    const registry = createMetricsRegistry({
      spans: () => 7,
    });

    const body = await registry.metrics();

    expect(body).toContain('broker_spans_count 7');
    expect(body).not.toContain('broker_messages_count');
    expect(body).not.toContain('broker_chunks_count');
    expect(body).not.toContain('broker_events_count');
  });

  test('reports the current count on each scrape', async () => {
    let spans = 0;
    const registry = createMetricsRegistry({spans: () => spans});

    expect(await registry.metrics()).toContain('broker_spans_count 0');
    spans = 42;
    expect(await registry.metrics()).toContain('broker_spans_count 42');
  });
});
