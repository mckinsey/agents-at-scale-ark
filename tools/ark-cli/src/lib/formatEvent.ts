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

export function pad(value: number, width: number): string {
  return value.toString().padStart(width, '0');
}

/**
 * Derive a HH:MM:SS.mmm timestamp from the event's own time fields, falling
 * back to now only when the event carries no usable timestamp.
 */
export function formatEventTimestamp(event: K8sEvent): string {
  const raw =
    event.eventTime ||
    event.lastTimestamp ||
    event.firstTimestamp ||
    event.metadata?.creationTimestamp;
  const parsed = raw ? new Date(raw) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
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

/**
 * Render the structured event-data JSON blob as indented, colorized
 * key/value lines. Falls back to the raw string when it is not JSON.
 */
export function formatEventData(eventData: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventData);
  } catch {
    return ` ${eventData}`;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return ` ${chalk.cyan(JSON.stringify(parsed))}`;
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    return '';
  }

  return (
    '\n' +
    entries
      .map(([key, value]) => {
        const rendered =
          value !== null && typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
        return `    ${chalk.dim(key)}: ${chalk.cyan(rendered)}`;
      })
      .join('\n')
  );
}

/**
 * Format a Kubernetes Event carrying an ark event-data annotation into a
 * human-readable line (plus indented detail). Returns null when the event
 * has no ark event-data payload.
 */
export function formatEvent(event: K8sEvent): string | null {
  const eventData = event.metadata?.annotations?.[EVENT_ANNOTATIONS.EVENT_DATA];
  if (!eventData) {
    return null;
  }

  const timestamp = formatEventTimestamp(event);
  const reason = event.reason || 'Unknown';
  const eventType = event.type || 'Normal';

  return `${chalk.gray(timestamp)} ${colorReason(reason, eventType)}${formatEventData(eventData)}`;
}
