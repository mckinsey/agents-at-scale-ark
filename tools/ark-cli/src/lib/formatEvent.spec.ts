import {describe, it, expect} from 'vitest';
import chalk from 'chalk';
import {
  formatEvent,
  formatEventTimestamp,
  formatEventData,
} from './formatEvent.js';
import {EVENT_ANNOTATIONS} from './constants.js';

function pad(value: number, width: number): string {
  return value.toString().padStart(width, '0');
}

function eventWithData(data: string, overrides = {}) {
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

describe('formatEvent', () => {
  it('returns null when the event has no ark event-data annotation', () => {
    expect(
      formatEvent({reason: 'Foo', metadata: {annotations: {}}})
    ).toBeNull();
    expect(formatEvent({reason: 'Foo'})).toBeNull();
  });

  it('renders reason with type-based color and a leading timestamp', () => {
    const event = eventWithData('{}', {
      eventTime: '2023-01-02T03:04:05.678Z',
    });
    const d = new Date('2023-01-02T03:04:05.678Z');
    const ts = `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;

    // Empty object → no detail lines appended
    expect(formatEvent(event)).toBe(
      `${chalk.gray(ts)} ${chalk.green('ResolveStart')}`
    );
  });

  it('pretty-prints structured event-data as indented key/value lines', () => {
    const event = eventWithData(JSON.stringify({agent: 'weather', tokens: 42}));
    const line = formatEvent(event);
    expect(line).toContain(`${chalk.dim('agent')}: ${chalk.cyan('weather')}`);
    expect(line).toContain(`${chalk.dim('tokens')}: ${chalk.cyan('42')}`);
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

  it('renders a non-object JSON value inline', () => {
    expect(formatEventData('"hello"')).toBe(` ${chalk.cyan('"hello"')}`);
  });

  it('serializes nested objects on a value line', () => {
    const out = formatEventData(JSON.stringify({nested: {a: 1}}));
    expect(out).toContain(`${chalk.dim('nested')}: ${chalk.cyan('{"a":1}')}`);
  });
});

describe('formatEventTimestamp', () => {
  it('uses the event own time fields over wall-clock', () => {
    const raw = '2020-06-07T08:09:10.123Z';
    const d = new Date(raw);
    const expected = `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;
    expect(formatEventTimestamp({lastTimestamp: raw})).toBe(expected);
  });

  it('does not throw on an invalid timestamp', () => {
    expect(() => formatEventTimestamp({eventTime: 'garbage'})).not.toThrow();
    expect(formatEventTimestamp({eventTime: 'garbage'})).toMatch(
      /^\d{2}:\d{2}:\d{2}\.\d{3}$/
    );
  });
});
