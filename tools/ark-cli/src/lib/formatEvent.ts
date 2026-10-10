import chalk from 'chalk';
import {EVENT_ANNOTATIONS} from './constants.js';

export interface K8sEvent {
  type?: string;
  reason?: string;
  eventTime?: string;
  lastTimestamp?: string;
  firstTimestamp?: string;
  metadata?: {
    uid?: string;
    creationTimestamp?: string;
    annotations?: Record<string, string>;
  };
}

/**
 * Shape of the JSON carried in the `ark.mckinsey.com/event-data` annotation:
 *
 *   {
 *     "durationMs": "7084.30",
 *     "input": "ok?",
 *     "message": "Query execution completed",
 *     "queryId": "0b61250b-...",
 *     "queryName": "cli-query-1784110137509",
 *     "queryNamespace": "ark-system",
 *     "sessionId": "0b61250b-...",
 *     "targetType": "model",
 *     "timestamp": "2026-07-15T10:09:04.602422162Z"
 *   }
 */

const NUMERIC = /^-?\d+(\.\d+)?$/;
const MAX_MESSAGE_LENGTH = 120;

// Fields rendered first (in this order); everything else is sorted alphabetically.
const FIELD_PRIORITY: Record<string, number> = {input: 0, durationMs: 1};

// Keys pulled out of the trailing field list because they are rendered elsewhere.
const RESERVED_KEYS = new Set(['message', 'timestamp']);

export function pad(value: number, width: number): string {
  return value.toString().padStart(width, '0');
}

function parseEventData(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function firstValidDate(candidates: Array<string | undefined>): Date {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date();
}

function truncate(value: string, max = MAX_MESSAGE_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Derive an HH:MM:SS.mmm timestamp, preferring the event-data payload timestamp
 * and falling back through the native Event time fields to wall-clock now.
 */
export function formatEventTimestamp(event: K8sEvent): string {
  const data = parseEventData(event.metadata?.annotations?.[EVENT_ANNOTATIONS.EVENT_DATA]);
  const dataTimestamp =
    typeof data?.timestamp === 'string' ? data.timestamp : undefined;

  const date = firstValidDate([
    dataTimestamp,
    event.eventTime,
    event.lastTimestamp,
    event.firstTimestamp,
    event.metadata?.creationTimestamp,
  ]);

  return `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}`;
}

function colorReason(reason: string, eventType: string): string {
  if (eventType === 'Warning') {
    return chalk.yellow(reason);
  }
  if (eventType === 'Normal') {
    return chalk.green(reason);
  }
  return chalk.red(reason);
}

function isErrorType(eventType: string): boolean {
  return eventType === 'Warning' || eventType === 'Error';
}

function compareKeys(a: string, b: string): number {
  const rank = (key: string) => FIELD_PRIORITY[key] ?? Number.MAX_SAFE_INTEGER;
  return rank(a) - rank(b) || a.localeCompare(b);
}

function renderFieldValue(key: string, value: unknown): string {
  if (typeof value === 'number') {
    return chalk.green(String(value));
  }
  if (value !== null && typeof value === 'object') {
    return chalk.white(JSON.stringify(value));
  }
  const str = String(value);
  if (NUMERIC.test(str)) {
    return chalk.green(str);
  }
  return chalk.white(key === 'input' ? `"${str}"` : str);
}

/**
 * Render the structured event-data payload as `message > key=value ...`.
 * The message is clipped and colored red for Warning/Error events; trailing
 * fields keep their full value. Non-object payloads are echoed as-is.
 */
export function formatEventData(eventData: string, eventType = 'Normal'): string {
  const data = parseEventData(eventData);
  if (!data) {
    return ` ${eventData}`;
  }

  const messageColor = isErrorType(eventType) ? chalk.red : chalk.white;
  const messagePart =
    typeof data.message === 'string'
      ? ` ${messageColor(truncate(data.message))}`
      : '';

  const fields = Object.keys(data)
    .filter((key) => !RESERVED_KEYS.has(key))
    .sort(compareKeys)
    .map((key) => `${chalk.blue(key)}${chalk.dim('=')}${renderFieldValue(key, data[key])}`)
    .join(' ');

  if (!fields) {
    return messagePart;
  }

  return `${messagePart} ${chalk.dim('>')} ${fields}`;
}

/**
 * Format a Kubernetes Event carrying an ark event-data annotation into a
 * single human-readable line. Returns null when the event has no payload.
 */
export function formatEvent(event: K8sEvent): string | null {
  const eventData = event.metadata?.annotations?.[EVENT_ANNOTATIONS.EVENT_DATA];
  if (!eventData) {
    return null;
  }

  const timestamp = formatEventTimestamp(event);
  const reason = event.reason || 'Unknown';
  const eventType = event.type || 'Normal';

  return `${chalk.dim(timestamp)} [${colorReason(reason, eventType)}]${formatEventData(eventData, eventType)}`;
}
