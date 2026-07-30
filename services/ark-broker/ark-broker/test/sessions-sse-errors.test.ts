import {EventEmitter} from 'node:events';
import {Writable} from 'node:stream';
import type {Request, Response} from 'express';
import {createLogger} from '../src/logging/logger.js';
import {SessionsBroker} from '../src/brokers/sessions-broker.js';
import type {SessionsStorage} from '../src/brokers/sessions-broker.js';
import {handleStreamingSessions} from '../src/http/routes/sessions/handlers.js';
import {sleep} from '../src/brokers/sessions/__tests__/testHelpers/sleep.js';

describe('sessions SSE error handling', () => {
  test('a failed session read is logged, not left as an unhandled rejection', async () => {
    // streamSSE re-reads the session inside the subscribe callback, so a read
    // that rejects there has no caller to propagate to: without a catch it
    // becomes an unhandled rejection, which Node's default kills the pod for.
    const lines: string[] = [];
    const logger = createLogger(
      {level: 'error', pretty: false},
      new Writable({
        write(chunk, _enc, cb): void {
          lines.push(String(chunk));
          cb();
        },
      })
    );

    let notify: (data: {
      sessionId: string;
      queryName: string;
    }) => void = () => {};
    const storage = {
      getSession: () => Promise.reject(new Error('database is gone')),
      getAll: () => Promise.resolve({sessions: {}}),
      subscribe: (
        callback: (data: {sessionId: string; queryName: string}) => void
      ) => {
        notify = callback;
        return (): void => {};
      },
    } as unknown as SessionsStorage;

    const rejections: unknown[] = [];
    const onRejection = (err: unknown): void => rejections.push(err);
    process.on('unhandledRejection', onRejection);

    try {
      const reqEmitter = new EventEmitter();
      const fakeReq = Object.assign(reqEmitter, {
        log: logger,
      }) as unknown as Request;
      const fakeRes = {
        setHeader: (): void => {},
        write: (): boolean => true,
      } as unknown as Response;

      handleStreamingSessions(
        fakeReq,
        fakeRes,
        new SessionsBroker(storage),
        undefined
      );
      await sleep(50);

      notify({sessionId: 'sess-1', queryName: 'query-1'});
      await sleep(100);
      // streamSSE keeps a heartbeat running until the request closes.
      reqEmitter.emit('close');
    } finally {
      process.off('unhandledRejection', onRejection);
    }

    expect(rejections).toEqual([]);
    expect(lines.join('')).toContain('failed to read updated session');
  });
});
