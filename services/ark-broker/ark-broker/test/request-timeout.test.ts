import http from 'http';
import express from 'express';
import {CompletionChunkBroker} from '../src/brokers/chunks-broker';
import {InMemoryChunkStream} from '../src/brokers/stream/in-memory-chunk-stream';
import {createLogger} from '../src/logging/logger';
import {createHttpLogger} from '../src/http/middleware/http-logger';
import {requestId} from '../src/http/middleware/request-id';
import {createStreamRouter} from '../src/http/routes/stream';
import {createTextChunk, createFinishChunk} from '../src/testing/chunk-helpers';

function createBrokerServer(
  opts: {requestTimeout?: number; timeout?: number} = {}
): {
  server: http.Server;
  chunks: CompletionChunkBroker;
} {
  const logger = createLogger({level: 'silent', pretty: false});
  const chunks = new CompletionChunkBroker(new InMemoryChunkStream(logger));
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use(createHttpLogger(logger));
  app.use('/stream', createStreamRouter(chunks));
  const server = http.createServer(app);
  server.requestTimeout = opts.requestTimeout ?? 0;
  server.timeout = opts.timeout ?? 0;
  return {server, chunks};
}

function listenOnRandomPort(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as {port: number}).port);
    });
  });
}

function slowChunkedPost(
  port: number,
  queryId: string,
  delayMs: number
): Promise<{statusCode: number; body: unknown} | {error: string}> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: `/stream/${queryId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({statusCode: res.statusCode!, body: JSON.parse(data)});
          } catch {
            resolve({statusCode: res.statusCode!, body: data});
          }
        });
      }
    );

    req.on('error', (err: Error & {code?: string}) => {
      resolve({error: err.code ?? err.message});
    });

    req.write(JSON.stringify(createTextChunk('hello')) + '\n');

    setTimeout(() => {
      try {
        req.write(JSON.stringify(createFinishChunk()) + '\n');
        req.end();
      } catch {
        // socket already destroyed — expected when timeout fires
      }
    }, delayMs);
  });
}

describe('Request Timeout Behavior', () => {
  let server: http.Server;

  afterEach((done) => {
    if (server?.listening) {
      server.close(done);
    } else {
      done();
    }
  });

  test('inactivity timeout kills slow chunked streams with ECONNRESET', async () => {
    const created = createBrokerServer({timeout: 2000});
    server = created.server;
    const port = await listenOnRandomPort(server);

    const result = await slowChunkedPost(port, 'timeout-query', 3000);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('ECONNRESET');
    }
  }, 15000);

  test('disabled timeouts allow slow chunked streams to complete', async () => {
    const created = createBrokerServer({requestTimeout: 0, timeout: 0});
    server = created.server;
    const port = await listenOnRandomPort(server);

    const result = await slowChunkedPost(port, 'no-timeout-query', 3000);

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.statusCode).toBe(200);
      expect(result.body.status).toBe('stream_processed');
      expect(result.body.chunks_received).toBe(2);
    }
  }, 15000);

  test('broker defaults to requestTimeout=0 for long-running streaming support', () => {
    const created = createBrokerServer();
    server = created.server;
    expect(server.requestTimeout).toBe(0);
  });
});
