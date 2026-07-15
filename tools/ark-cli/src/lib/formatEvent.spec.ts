import {describe, it, expect} from 'vitest';
import chalk from 'chalk';
import {
  formatEvent,
  formatEventTimestamp,
  formatEventData,
  pad,
} from './formatEvent.js';
import {EVENT_ANNOTATIONS} from './constants.js';

function eventWithData(data: string, overrides: Record<string, unknown> = {}) {
  return {
    reason: 'ResolveStart',
    type: 'Normal',
    metadata: {
      uid: 'uid-1',
      annotations: {[EVENT_ANNOTATIONS.EVENT_DATA]: data},
    },
    ...overrides,
  };
}

function hhmmss(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;
}

describe('formatEvent', () => {
  it('returns null when the event has no ark event-data annotation', () => {
    expect(
      formatEvent({reason: 'Foo', metadata: {annotations: {}}})
    ).toBeNull();
    expect(formatEvent({reason: 'Foo'})).toBeNull();
  });

  it('renders a dim timestamp and a bracketed, type-colored reason', () => {
    const event = eventWithData('{}', {eventTime: '2023-01-02T03:04:05.678Z'});
    const ts = hhmmss('2023-01-02T03:04:05.678Z');

    // Empty object → no trailing fields, no message.
    expect(formatEvent(event)).toBe(
      `${chalk.dim(ts)} [${chalk.green('ResolveStart')}]`
    );
  });

  it('renders message then key=value fields', () => {
    const event = eventWithData(
      JSON.stringify({message: 'hi', agent: 'weather', tokens: 42})
    );
    const line = formatEvent(event);
    expect(line).toContain(chalk.white('hi'));
    expect(line).toContain(chalk.dim('>'));
    expect(line).toContain(`${chalk.blue('agent')}${chalk.dim('=')}${chalk.white('weather')}`);
    expect(line).toContain(`${chalk.blue('tokens')}${chalk.dim('=')}${chalk.green('42')}`);
  });

  it('colors Warning reasons yellow and unknown types red', () => {
    const warn = formatEvent(
      eventWithData('{}', {type: 'Warning', reason: 'Slow'})
    );
    expect(warn).toContain(chalk.yellow('Slow'));
    const err = formatEvent(
      eventWithData('{}', {type: 'Error', reason: 'Boom'})
    );
    expect(err).toContain(chalk.red('Boom'));
  });

  it('defaults reason to Unknown and type to Normal', () => {
    const line = formatEvent(
      eventWithData('{}', {reason: undefined, type: undefined})
    );
    expect(line).toContain(chalk.green('Unknown'));
  });
});

describe('formatEventData', () => {
  it('falls back to the raw string when the payload is not JSON', () => {
    expect(formatEventData('not-json')).toBe(' not-json');
  });

  it('echoes non-object JSON payloads as-is', () => {
    expect(formatEventData('"hello"')).toBe(' "hello"');
  });

  it('serializes nested objects inline as the field value', () => {
    const out = formatEventData(JSON.stringify({nested: {a: 1}}));
    expect(out).toContain(
      `${chalk.blue('nested')}${chalk.dim('=')}${chalk.white('{"a":1}')}`
    );
  });

  it('drops the message and timestamp keys from the trailing fields', () => {
    const out = formatEventData(
      JSON.stringify({message: 'done', timestamp: '2026-01-01T00:00:00Z', foo: 'bar'})
    );
    expect(out).toContain(chalk.white('done'));
    expect(out).not.toContain(chalk.blue('message'));
    expect(out).not.toContain(chalk.blue('timestamp'));
    expect(out).toContain(`${chalk.blue('foo')}${chalk.dim('=')}${chalk.white('bar')}`);
  });

  it('orders input first, durationMs second, then the rest alphabetically', () => {
    const out = formatEventData(
      JSON.stringify({
        zeta: '1',
        alpha: '2',
        durationMs: '10',
        input: 'q',
      })
    );
    const order = ['input', 'durationMs', 'alpha', 'zeta'].map(
      (k) => out.indexOf(chalk.blue(k))
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('quotes only the input value', () => {
    const out = formatEventData(
      JSON.stringify({input: 'ok?', queryName: 'cli-query-1'})
    );
    expect(out).toContain(`${chalk.blue('input')}${chalk.dim('=')}${chalk.white('"ok?"')}`);
    expect(out).toContain(
      `${chalk.blue('queryName')}${chalk.dim('=')}${chalk.white('cli-query-1')}`
    );
  });

  it('renders numeric string values as green numbers', () => {
    const out = formatEventData(JSON.stringify({durationMs: '12084.20'}));
    expect(out).toContain(`${chalk.blue('durationMs')}${chalk.dim('=')}${chalk.green('12084.20')}`);
  });

  it('colors the message red for Warning and Error events', () => {
    const warn = formatEventData(JSON.stringify({message: 'boom'}), 'Warning');
    expect(warn).toBe(` ${chalk.red('boom')}`);
    const err = formatEventData(JSON.stringify({message: 'boom'}), 'Error');
    expect(err).toBe(` ${chalk.red('boom')}`);
    const normal = formatEventData(JSON.stringify({message: 'ok'}), 'Normal');
    expect(normal).toBe(` ${chalk.white('ok')}`);
  });

  it('truncates a long message but leaves field values intact', () => {
    const longMessage = 'x'.repeat(200);
    const longError = 'e'.repeat(200);
    const out = formatEventData(
      JSON.stringify({message: longMessage, error: longError})
    );
    expect(out).toContain('…');
    expect(out).toContain(chalk.white(`${'x'.repeat(120)}…`));
    // Field values are not truncated and the error field is not red.
    expect(out).toContain(`${chalk.blue('error')}${chalk.dim('=')}${chalk.white(longError)}`);
  });
});

describe('formatEventTimestamp', () => {
  it('prefers the event-data payload timestamp', () => {
    const raw = '2020-06-07T08:09:10.123Z';
    const event = eventWithData(JSON.stringify({timestamp: raw}));
    expect(formatEventTimestamp(event)).toBe(hhmmss(raw));
  });

  it('falls back to native event time fields', () => {
    const raw = '2020-06-07T08:09:10.123Z';
    expect(formatEventTimestamp({lastTimestamp: raw})).toBe(hhmmss(raw));
    expect(formatEventTimestamp({eventTime: raw})).toBe(hhmmss(raw));
  });

  it('does not throw on an invalid timestamp and falls back to now', () => {
    expect(() => formatEventTimestamp({eventTime: 'garbage'})).not.toThrow();
    expect(formatEventTimestamp({eventTime: 'garbage'})).toMatch(
      /^\d{2}:\d{2}:\d{2}\.\d{3}$/
    );
  });

  it('does not throw on malformed event-data JSON', () => {
    const event = eventWithData('{not json');
    expect(() => formatEventTimestamp(event)).not.toThrow();
    expect(formatEventTimestamp(event)).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});
