import request from 'supertest';
import express from 'express';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventBroker} from '@ark-broker/brokers/event-broker';
import {InMemoryEventStream} from '@ark-broker/brokers/stream/in-memory-event-stream';
import {SessionsBroker} from '@ark-broker/brokers/sessions-broker';
import {InMemorySessionsStorage} from '@ark-broker/brokers/sessions/in-memory-sessions-storage';
import {createLogger} from '@ark-broker/logging/logger';
import {createHttpLogger} from '@ark-broker/http/middleware/http-logger';
import {requestId} from '@ark-broker/http/middleware/request-id';
import {createEventsRouter} from './index';

// Seam test: exercise the persist -> restart -> read contract at the HTTP
// layer, not just the store. The invariant that matters to consumers is that
// pagination/watch cursors (sequence numbers) stay monotonic and gapless across
// a broker restart — a regressed nextSequence would make a resuming watcher
// silently miss post-restart events.

const logger = createLogger({level: 'silent', pretty: false});

type Booted = {app: express.Express; stream: InMemoryEventStream};

async function boot(path: string): Promise<Booted> {
  const stream = new InMemoryEventStream(logger, 'Event', {path});
  await stream.init();
  const events = new EventBroker(stream);
  const sessions = new SessionsBroker(new InMemorySessionsStorage(logger));
  const app = express();
  app.use(express.json() as express.RequestHandler);
  app.use(requestId);
  app.use(createHttpLogger(logger));
  app.use('/events', createEventsRouter(events, sessions));
  return {app, stream};
}

async function postEvent(app: express.Express, message: string): Promise<void> {
  const res = await request(app)
    .post('/events')
    .send({
      timestamp: new Date().toISOString(),
      eventType: 'QueryExecutionComplete',
      reason: 'Completed',
      message,
      data: {
        queryId: 'q1',
        queryName: 'q1',
        queryNamespace: 'default',
        sessionId: 's1',
      },
    });
  expect(res.status).toBe(201);
}

type Page = {messages: string[]; nextCursor?: number; hasMore: boolean};

async function getPage(app: express.Express, cursor?: number): Promise<Page> {
  const url =
    cursor === undefined
      ? '/events?limit=2'
      : `/events?limit=2&cursor=${cursor}`;
  const res = await request(app).get(url);
  expect(res.status).toBe(200);
  return {
    messages: (res.body.items as {message: string}[]).map((e) => e.message),
    nextCursor: res.body.nextCursor,
    hasMore: res.body.hasMore,
  };
}

// Consume an SSE watch stream until a short idle timeout, returning the
// `message` field of every replayed/streamed event, in order. Uses a real
// listening server + raw http client so the open (never-terminating) stream can
// be torn down deterministically without leaking socket errors.
function watch(
  app: express.Express,
  cursor: number,
  timeoutMs = 400
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const messages: string[] = [];
    const server = http.createServer(app);
    server.listen(0, () => {
      const {port} = server.address() as AddressInfo;
      const req = http.get(
        `http://127.0.0.1:${port}/events?watch=true&cursor=${cursor}`,
        {agent: false},
        (res) => {
          res.on('error', () => {});
          let buffer = '';
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed && typeof parsed.message === 'string') {
                  messages.push(parsed.message);
                }
              } catch {
                // heartbeat / non-JSON frame
              }
            }
          });
          setTimeout(() => {
            res.destroy();
            req.destroy();
            server.close(() => resolve(messages));
          }, timeoutMs);
        }
      );
      req.on('error', () => {});
    });
    server.on('error', reject);
  });
}

describe('events persistence — restart seam', () => {
  let dir: string;
  let path: string;
  const open: InMemoryEventStream[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'events-restart-seam-'));
    path = join(dir, 'events.jsonl');
  });

  afterEach(() => {
    for (const s of open.splice(0)) s.close();
    rmSync(dir, {recursive: true, force: true});
  });

  it('keeps pagination cursors gapless and monotonic across a restart', async () => {
    const first = await boot(path);
    open.push(first.stream);
    await postEvent(first.app, 'e1');
    await postEvent(first.app, 'e2');
    await postEvent(first.app, 'e3');

    const page1 = await getPage(first.app);
    expect(page1.messages).toEqual(['e1', 'e2']);
    expect(page1.nextCursor).toBe(2);
    expect(page1.hasMore).toBe(true);

    // Restart: a fresh stream/app on the same file, reloaded from disk.
    const second = await boot(path);
    open.push(second.stream);

    // Resuming from the pre-restart cursor returns exactly the tail — no gap
    // (e3 present) and no replay (e1/e2 not repeated).
    const page2 = await getPage(second.app, page1.nextCursor);
    expect(page2.messages).toEqual(['e3']);
    expect(page2.hasMore).toBe(false);

    // A new event after restart must continue the sequence, not reuse a number
    // at or below an already-issued cursor. If nextSequence had regressed, a
    // watcher/paginator resuming at cursor 3 would never see e4.
    await postEvent(second.app, 'e4');
    const page3 = await getPage(second.app, 3);
    expect(page3.messages).toEqual(['e4']);
    // Nothing past cursor 4 pins e4's sequence to exactly 4 — the counter
    // resumed at the post-restart high-water mark rather than regressing.
    const page4 = await getPage(second.app, 4);
    expect(page4.messages).toEqual([]);
  });

  it('replays the correct tail to a watch consumer resuming after restart', async () => {
    const first = await boot(path);
    open.push(first.stream);
    await postEvent(first.app, 'e1');
    await postEvent(first.app, 'e2');
    await postEvent(first.app, 'e3');

    const second = await boot(path);
    open.push(second.stream);
    await postEvent(second.app, 'e4');

    // A consumer that had seen up to cursor 2 resumes: it must receive e3 and
    // e4 exactly once, and nothing it already had (e1/e2).
    const replayed = await watch(second.app, 2);
    expect(replayed).toEqual(['e3', 'e4']);
  });
});
