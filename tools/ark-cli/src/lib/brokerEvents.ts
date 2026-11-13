import {execa} from 'execa';
import chalk from 'chalk';
import {ArkApiProxy} from './arkApiProxy.js';
import {loadConfig} from './config.js';
import {watchEventsLive} from './kubectl.js';
import {
  type BrokerEvent,
  brokerEventPayload,
  formatBrokerEvent,
  formatBrokerEventRaw,
} from './formatEvent.js';

const QUERY_TIMEOUT_SECONDS = 300;
const TERMINAL_REASONS = new Set([
  'QueryExecutionComplete',
  'QueryExecutionError',
  'QueryExecutionCanceled',
]);

export interface StreamTimings {
  connectTimeoutMs: number;
  maxDrainMs: number;
}

export const DEFAULT_TIMINGS: StreamTimings = {
  connectTimeoutMs: 10000,
  maxDrainMs: 2000,
};

type EventStream = NonNullable<Response['body']>;
type PumpResult = 'fallback' | 'ended';

interface PumpState {
  received: boolean;
  onTerminal: () => void;
}

export interface WatchQueryEventsOptions {
  queryName: string;
  queryUid?: string;
  pretty?: boolean;
  timings?: StreamTimings;
}

export async function watchQueryEvents(
  options: WatchQueryEventsOptions
): Promise<void> {
  const {queryName, queryUid, pretty = false, timings} = options;

  if (!queryUid) {
    await watchEventsLive(queryName, pretty);
    return;
  }

  const config = loadConfig();
  const proxy = new ArkApiProxy(
    undefined,
    config.services?.reusePortForwards ?? false
  );

  try {
    let baseUrl: string;
    try {
      baseUrl = (await proxy.start()).getBaseUrl();
    } catch {
      await watchEventsLive(queryName, pretty);
      return;
    }

    const streamed = await streamBrokerEvents(
      baseUrl,
      queryName,
      queryUid,
      pretty,
      timings
    );
    if (!streamed) {
      await watchEventsLive(queryName, pretty);
    }
  } finally {
    proxy.stop();
  }
}

export async function streamBrokerEvents(
  baseUrl: string,
  queryName: string,
  queryUid: string,
  pretty = false,
  timings: StreamTimings = DEFAULT_TIMINGS
): Promise<boolean> {
  const controller = new AbortController();
  const url = `${baseUrl}/v1/broker/events/${encodeURIComponent(queryUid)}?watch=true&from-beginning=true`;

  const stream = await openStream(url, controller, timings.connectTimeoutMs);
  if (!stream) {
    return false;
  }

  const wait = execa(
    'kubectl',
    [
      'wait',
      '--for=condition=Completed',
      `query/${queryName}`,
      `--timeout=${QUERY_TIMEOUT_SECONDS}s`,
    ],
    {timeout: QUERY_TIMEOUT_SECONDS * 1000}
  );
  const waitSettled: Promise<unknown> = wait.then(
    () => undefined,
    (error: unknown) => error ?? new Error('Unknown error')
  );

  let markTerminal: () => void = () => {};
  const terminal = new Promise<void>((resolve) => {
    markTerminal = resolve;
  });
  const state: PumpState = {received: false, onTerminal: markTerminal};
  const pump = pumpEvents(stream, pretty, controller.signal, state);

  const raced = await Promise.race([pump, waitSettled.then(() => 'waited')]);
  if (raced === 'fallback') {
    controller.abort();
    wait.kill();
    await waitSettled;
    return false;
  }

  const waitError = await waitSettled;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    terminal,
    pump,
    new Promise((resolve) => {
      drainTimer = setTimeout(resolve, timings.maxDrainMs);
    }),
  ]);
  clearTimeout(drainTimer);
  controller.abort();

  if ((await pump) === 'fallback' || !state.received) {
    return false;
  }

  if (waitError) {
    console.error(
      chalk.red(
        'Query wait failed:',
        waitError instanceof Error ? waitError.message : 'Unknown error'
      )
    );
  }
  return true;
}

async function openStream(
  url: string,
  controller: AbortController,
  connectTimeoutMs: number
): Promise<EventStream | null> {
  const timer = setTimeout(() => controller.abort(), connectTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {Accept: 'text/event-stream'},
    });
    if (!response.ok || !response.body) {
      return null;
    }
    return response.body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseFrame(frame: string): Record<string, unknown> | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.substring(5).replace(/^ /, ''))
    .join('\n');
  if (!data) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function eventKey(event: BrokerEvent): string {
  return JSON.stringify([
    event.reason,
    event.eventType,
    event.timestamp,
    brokerEventPayload(event),
  ]);
}

async function pumpEvents(
  stream: EventStream,
  pretty: boolean,
  signal: AbortSignal,
  state: PumpState
): Promise<PumpResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const seen = new Set<string>();
  let buffer = '';

  const handle = (frame: string): PumpResult | undefined => {
    const payload = parseFrame(frame);
    if (!payload) {
      return undefined;
    }

    if ('error' in payload) {
      if (!state.received) {
        return 'fallback';
      }
      console.error(chalk.yellow('Broker event stream reported an error'));
      return 'ended';
    }

    const event = payload as BrokerEvent;
    const key = eventKey(event);
    if (seen.has(key)) {
      return undefined;
    }
    seen.add(key);
    state.received = true;

    console.log(
      pretty ? formatBrokerEvent(event) : formatBrokerEventRaw(event)
    );
    if (event.reason && TERMINAL_REASONS.has(event.reason)) {
      state.onTerminal();
    }
    return undefined;
  };

  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }

      buffer = (buffer + decoder.decode(value, {stream: true})).replace(
        /\r\n/g,
        '\n'
      );
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        const result = handle(frame);
        if (result) {
          return result;
        }
      }
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error(
        chalk.yellow(
          'Broker event stream interrupted:',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
    return 'ended';
  }

  return handle(buffer) ?? 'ended';
}
