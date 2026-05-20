import {Writable} from 'node:stream';
import {createLogger} from '../logger.js';

class MemorySink extends Writable {
  public readonly lines: string[] = [];

  _write(chunk: Buffer, _enc: string, cb: (err?: Error) => void): void {
    this.lines.push(chunk.toString().trim());
    cb();
  }

  lastJson(): Record<string, unknown> {
    return JSON.parse(this.lines[this.lines.length - 1]);
  }
}

describe('createLogger', () => {
  it('returns a pino logger with the configured level', () => {
    const logger = createLogger({level: 'debug', pretty: false});
    expect(logger.level).toBe('debug');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('returns independent instances on each call', () => {
    const a = createLogger({level: 'info', pretty: false});
    const b = createLogger({level: 'info', pretty: false});
    expect(a).not.toBe(b);
    a.level = 'debug';
    expect(b.level).toBe('info');
  });

  it('supports the silent level', () => {
    const logger = createLogger({level: 'silent', pretty: false});
    expect(logger.level).toBe('silent');
  });

  it('child loggers inherit the configured level', () => {
    const logger = createLogger({level: 'warn', pretty: false});
    const child = logger.child({reqId: 'abc'});
    expect(child.level).toBe('warn');
  });

  it('emits ISO 8601 timestamps', () => {
    const sink = new MemorySink();
    const logger = createLogger({level: 'info', pretty: false}, sink);
    logger.info('hello');
    expect(sink.lastJson().time).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it('serializes the level as a string label, not a number', () => {
    const sink = new MemorySink();
    const logger = createLogger({level: 'info', pretty: false}, sink);
    logger.info('hello');
    expect(sink.lastJson().level).toBe('info');
  });

  it('redacts auth headers under req.headers', () => {
    const sink = new MemorySink();
    const logger = createLogger({level: 'info', pretty: false}, sink);
    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer secret-token',
            cookie: 'session=abc',
            'x-api-key': 'k-123',
            'user-agent': 'curl/8',
          },
        },
      },
      'request received'
    );

    const line = sink.lastJson();
    const headers = (line.req as {headers: Record<string, string>}).headers;
    expect(headers.authorization).toBe('[REDACTED]');
    expect(headers.cookie).toBe('[REDACTED]');
    expect(headers['x-api-key']).toBe('[REDACTED]');
    expect(headers['user-agent']).toBe('curl/8');
  });

  it('redacts common credential-bearing fields at top level and one level deep', () => {
    const sink = new MemorySink();
    const logger = createLogger({level: 'info', pretty: false}, sink);
    logger.info(
      {
        password: 'pw',
        token: 'tk',
        user: {password: 'nested-pw', name: 'bob'},
      },
      'auth attempt'
    );

    const line = sink.lastJson();
    expect(line.password).toBe('[REDACTED]');
    expect(line.token).toBe('[REDACTED]');
    expect((line.user as Record<string, string>).password).toBe('[REDACTED]');
    expect((line.user as Record<string, string>).name).toBe('bob');
  });

  it('serializes Error objects with message and stack via the err serializer', () => {
    const sink = new MemorySink();
    const logger = createLogger({level: 'info', pretty: false}, sink);
    logger.error({err: new Error('boom')}, 'failed');

    const line = sink.lastJson();
    const err = line.err as Record<string, string>;
    expect(err.message).toBe('boom');
    expect(err.stack).toMatch(/Error: boom/);
  });
});
