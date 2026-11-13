import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

const mockExeca = vi.fn();
vi.mock('execa', () => ({execa: mockExeca}));

const mockWatchEventsLive = vi.fn();
vi.mock('./kubectl.js', () => ({watchEventsLive: mockWatchEventsLive}));

vi.mock('./config.js', () => ({loadConfig: () => ({})}));

const mockProxyStart = vi.fn();
const mockProxyStop = vi.fn();
vi.mock('./arkApiProxy.js', () => ({
  ArkApiProxy: vi.fn(function () {
    return {start: mockProxyStart, stop: mockProxyStop};
  }),
}));

const {watchQueryEvents} = await import('./brokerEvents.js');
const {formatBrokerEvent, brokerEventPayload} =
  await import('./formatEvent.js');

const BASE_URL = 'http://localhost:1234';
const FAST = {connectTimeoutMs: 1000, maxDrainMs: 30};
const NO_DRAIN_TIMEOUT = {connectTimeoutMs: 1000, maxDrainMs: 60_000};

function event(reason: string, extra: Record<string, unknown> = {}) {
  return {
    timestamp: '2026-07-15T10:09:04.602Z',
    eventType: 'Normal',
    reason,
    message: `${reason} message`,
    data: {
      message: `${reason} message`,
      queryId: 'uid-1',
      queryName: 'q',
      timestamp: '2026-07-15T10:09:04.602Z',
      ...extra,
    },
  };
}

function frame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function controllableStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let signal: AbortSignal | undefined;
  const fetchMock = vi.fn(
    async (_url: string, init?: {signal?: AbortSignal | null}) => {
      signal = init?.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
          signal?.addEventListener('abort', () =>
            c.error(new DOMException('aborted', 'AbortError'))
          );
        },
      });
      return new Response(body, {status: 200});
    }
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    push: (chunk: string) => controller!.enqueue(encoder.encode(chunk)),
    close: () => controller!.close(),
    fail: (error: Error) => controller!.error(error),
    signal: () => signal!,
  };
}

function deferredWait() {
  let succeed: () => void = () => {};
  let fail: (error: Error) => void = () => {};
  const promise = new Promise((resolve, reject) => {
    succeed = () => resolve({stdout: ''});
    fail = reject;
  });
  const kill = vi.fn(() => fail(new Error('killed')));
  return Object.assign(promise, {kill, succeed, fail});
}

describe('watchQueryEvents', () => {
  let logs: string[];
  let errors: string[];
  let wait: ReturnType<typeof deferredWait>;

  const started = () => vi.waitFor(() => expect(mockExeca).toHaveBeenCalled());

  beforeEach(() => {
    vi.clearAllMocks();
    logs = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line);
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });
    mockProxyStart.mockResolvedValue({getBaseUrl: () => BASE_URL});
    mockWatchEventsLive.mockResolvedValue(undefined);
    wait = deferredWait();
    mockExeca.mockReturnValue(wait);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('fallback to kubectl', () => {
    it('is used when the Query UID is unknown', async () => {
      const {fetchMock} = controllableStream();

      await watchQueryEvents({queryName: 'q', pretty: true});

      expect(mockWatchEventsLive).toHaveBeenCalledWith('q', true);
      expect(mockProxyStart).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is used when ark-api cannot be reached', async () => {
      mockProxyStart.mockRejectedValue(new Error('port-forward failed'));
      const {fetchMock} = controllableStream();

      await watchQueryEvents({queryName: 'q', queryUid: 'uid-1'});

      expect(mockWatchEventsLive).toHaveBeenCalledWith('q', false);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockProxyStop).toHaveBeenCalled();
    });

    it('is used when ark-api answers with an error status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', {status: 503}))
      );

      await watchQueryEvents({queryName: 'q', queryUid: 'uid-1'});

      expect(mockWatchEventsLive).toHaveBeenCalledWith('q', false);
      expect(mockExeca).not.toHaveBeenCalled();
      expect(mockProxyStop).toHaveBeenCalled();
    });

    it('is used when the request fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('ECONNREFUSED');
        })
      );

      await watchQueryEvents({queryName: 'q', queryUid: 'uid-1'});

      expect(mockWatchEventsLive).toHaveBeenCalledWith('q', false);
    });

    it('is used when ark-api never sends response headers', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: {signal?: AbortSignal | null}) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError'))
              );
            })
        )
      );

      await watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: {connectTimeoutMs: 20, maxDrainMs: 30},
      });

      expect(mockWatchEventsLive).toHaveBeenCalledWith('q', false);
      expect(mockExeca).not.toHaveBeenCalled();
    });

    it('is used when the first frame is a broker error', async () => {
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        pretty: true,
        timings: FAST,
      });
      await started();

      stream.push(': connected\n\n');
      stream.push(frame({error: {message: 'x', type: 'connection_error'}}));
      await done;

      expect(wait.kill).toHaveBeenCalled();
      expect(stream.signal().aborted).toBe(true);
      expect(mockWatchEventsLive).toHaveBeenCalledWith('q', true);
      expect(logs).toEqual([]);
    });

    it('is used when the broker error arrives after the query completed', async () => {
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: NO_DRAIN_TIMEOUT,
      });
      await started();

      wait.succeed();
      await new Promise((resolve) => setTimeout(resolve, 10));
      stream.push(frame({error: {message: 'connect timeout'}}));
      await done;

      expect(mockWatchEventsLive).toHaveBeenCalledWith('q', false);
      expect(logs).toEqual([]);
    });

    it('is used when no event arrived by the time the query completed', async () => {
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: FAST,
      });
      await started();

      stream.push(': connected\n\n');
      stream.push('data: not-json\n\ndata: [1,2]\n\ndata: null\n\n');
      wait.succeed();
      await done;

      expect(stream.signal().aborted).toBe(true);
      expect(mockWatchEventsLive).toHaveBeenCalledWith('q', false);
      expect(logs).toEqual([]);
    });
  });

  describe('broker stream', () => {
    it('streams events by Query UID and stops at the terminal event', async () => {
      const first = event('QueryExecutionStart');
      const second = event('LLMCallComplete', {durationMs: '12.5'});
      const last = event('QueryExecutionComplete');
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid/1',
        timings: NO_DRAIN_TIMEOUT,
      });
      await started();

      stream.push(': connected\n\n');
      stream.push(frame(first));
      stream.push(frame(first));
      stream.push(frame(second).slice(0, 10));
      stream.push(frame(second).slice(10));
      await vi.waitFor(() => expect(logs).toHaveLength(2));
      wait.succeed();
      await new Promise((resolve) => setTimeout(resolve, 10));
      stream.push(frame(last));
      await done;

      expect(stream.fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/v1/broker/events/uid%2F1?watch=true&from-beginning=true`,
        expect.objectContaining({signal: expect.any(AbortSignal)})
      );
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        ['wait', '--for=condition=Completed', 'query/q', '--timeout=300s'],
        expect.any(Object)
      );
      expect(logs).toHaveLength(3);
      expect(logs[0]).toContain('QueryExecutionStart');
      expect(logs[0]).toContain(JSON.stringify(first.data));
      expect(logs[1]).toContain(JSON.stringify(brokerEventPayload(second)));
      expect(logs[2]).toContain('QueryExecutionComplete');
      expect(stream.signal().aborted).toBe(true);
      expect(mockWatchEventsLive).not.toHaveBeenCalled();
      expect(mockProxyStop).toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it.each(['QueryExecutionError', 'QueryExecutionCanceled'])(
      'treats %s as terminal',
      async (reason) => {
        const stream = controllableStream();
        const done = watchQueryEvents({
          queryName: 'q',
          queryUid: 'uid-1',
          timings: NO_DRAIN_TIMEOUT,
        });
        await started();

        stream.push(frame(event(reason)));
        wait.succeed();
        await done;

        expect(logs).toHaveLength(1);
        expect(mockWatchEventsLive).not.toHaveBeenCalled();
      }
    );

    it('stops after the drain limit when no terminal event arrives', async () => {
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: FAST,
      });
      await started();

      stream.push(frame(event('QueryExecutionStart')));
      await vi.waitFor(() => expect(logs).toHaveLength(1));
      wait.succeed();
      await done;

      expect(stream.signal().aborted).toBe(true);
      expect(mockWatchEventsLive).not.toHaveBeenCalled();
    });

    it('prints each event once even when replay reorders its keys', async () => {
      const ev = event('ToolCallComplete');
      const reordered = {
        data: {
          timestamp: ev.data.timestamp,
          queryName: 'q',
          queryId: 'uid-1',
          message: ev.data.message,
        },
        message: ev.message,
        reason: ev.reason,
        eventType: ev.eventType,
        timestamp: ev.timestamp,
      };
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: FAST,
      });
      await started();

      stream.push(frame(ev));
      stream.push(frame(reordered));
      await vi.waitFor(() => expect(logs).toHaveLength(1));
      wait.succeed();
      await done;

      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain(JSON.stringify(ev.data));
    });

    it('renders pretty lines with the broker formatter', async () => {
      const ev = event('QueryExecutionComplete');
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        pretty: true,
        timings: FAST,
      });
      await started();

      stream.push(frame(ev));
      wait.succeed();
      await done;

      expect(logs).toEqual([formatBrokerEvent(ev)]);
    });

    it('parses CRLF frames, multi-line data and a final frame without a blank line', async () => {
      const a = event('QueryExecutionStart');
      const b = event('AgentExecutionStart');
      const c = event('QueryExecutionComplete');
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: FAST,
      });
      await started();

      stream.push(`data: ${JSON.stringify(a)}\r`);
      stream.push('\n\r\n');
      const bJson = JSON.stringify(b);
      const cut = bJson.indexOf(',') + 1;
      stream.push(
        `data: ${bJson.slice(0, cut)}\ndata: ${bJson.slice(cut)}\n\n`
      );
      stream.push(`data: ${JSON.stringify(c)}`);
      stream.close();
      wait.succeed();
      await done;

      expect(logs).toHaveLength(3);
      expect(logs[0]).toContain('QueryExecutionStart');
      expect(logs[1]).toContain('AgentExecutionStart');
      expect(logs[2]).toContain('QueryExecutionComplete');
    });

    it('keeps waiting for the query when the stream closes early', async () => {
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: FAST,
      });
      await started();

      stream.push(frame(event('QueryExecutionStart')));
      stream.close();
      await new Promise((resolve) => setTimeout(resolve, 20));
      let settled = false;
      void done.then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(settled).toBe(false);

      wait.succeed();
      await done;

      expect(logs).toHaveLength(1);
      expect(mockWatchEventsLive).not.toHaveBeenCalled();
    });

    it('warns when the stream breaks and still waits for the query', async () => {
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: FAST,
      });
      await started();

      stream.push(frame(event('QueryExecutionStart')));
      await vi.waitFor(() => expect(logs).toHaveLength(1));
      stream.fail(new Error('socket hang up'));
      await vi.waitFor(() =>
        expect(errors.some((e) => e.includes('socket hang up'))).toBe(true)
      );
      wait.succeed();
      await done;

      expect(errors.some((e) => e.includes('interrupted'))).toBe(true);
      expect(mockWatchEventsLive).not.toHaveBeenCalled();
    });

    it('reports a failed wait and does not fall back', async () => {
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: FAST,
      });
      await started();

      stream.push(frame(event('QueryExecutionStart')));
      await vi.waitFor(() => expect(logs).toHaveLength(1));
      wait.fail(new Error('timed out'));
      await done;

      expect(errors.some((e) => e.includes('Query wait failed'))).toBe(true);
      expect(errors.some((e) => e.includes('timed out'))).toBe(true);
      expect(mockWatchEventsLive).not.toHaveBeenCalled();
    });

    it('keeps broker output when an error frame follows events', async () => {
      const stream = controllableStream();
      const done = watchQueryEvents({
        queryName: 'q',
        queryUid: 'uid-1',
        timings: FAST,
      });
      await started();

      stream.push(frame(event('QueryExecutionStart')));
      stream.push(frame({error: {message: 'boom'}}));
      await vi.waitFor(() =>
        expect(errors.some((e) => e.includes('reported an error'))).toBe(true)
      );
      wait.succeed();
      await done;

      expect(logs).toHaveLength(1);
      expect(mockWatchEventsLive).not.toHaveBeenCalled();
    });
  });
});
