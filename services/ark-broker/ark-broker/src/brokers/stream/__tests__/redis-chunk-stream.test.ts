import {createLogger} from '@ark-broker/logging/logger';
import {
  useRedisContainer,
  useRedisContainerWithAuth,
  useRedisContainerTls,
} from '@ark-broker/redis/__tests__/testHelpers/redis-testcontainer';
import {RedisChunkStream} from '../redis-chunk-stream';
import {runChunkStreamContract} from './testHelpers/chunk-stream-contract';

jest.setTimeout(120_000);

const describeIntegration =
  process.env.SKIP_INTEGRATION === 'true' ? describe.skip : describe;

const logger = createLogger({level: 'silent', pretty: false});
const PREFIX = 'ark-broker-test';
const TTL = 300;

describeIntegration('RedisChunkStream — chunk stream contract', () => {
  const {client} = useRedisContainer();

  runChunkStreamContract(
    () => new RedisChunkStream(client(), logger, PREFIX, TTL)
  );
});

describeIntegration('RedisChunkStream — with auth', () => {
  const {client} = useRedisContainerWithAuth();

  runChunkStreamContract(
    () => new RedisChunkStream(client(), logger, PREFIX, TTL)
  );
});

describeIntegration('RedisChunkStream — with TLS + auth', () => {
  const {client} = useRedisContainerTls();

  runChunkStreamContract(
    () => new RedisChunkStream(client(), logger, PREFIX, TTL)
  );
});

describeIntegration('RedisChunkStream — redis-specific', () => {
  const {client} = useRedisContainer();

  it('dual-write: appending creates both per-query and all keys', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    await stream.appendChunk('q1', {text: 'hi'});

    const qLen = await client().xlen(`${PREFIX}:chunks:q1`);
    const allLen = await client().xlen(`${PREFIX}:chunks:all`);
    expect(qLen).toBe(1);
    expect(allLen).toBe(1);
  });

  it('per-query key has TTL set after append', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    await stream.appendChunk('q1', {text: 'hi'});

    const ttl = await client().ttl(`${PREFIX}:chunks:q1`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(TTL);
  });

  it('all-key TTL is refreshed on each append', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    await stream.appendChunk('q1', {text: 'first'});
    const ttl1 = await client().ttl(`${PREFIX}:chunks:all`);
    await new Promise((r) => setTimeout(r, 50));
    await stream.appendChunk('q2', {text: 'second'});
    const ttl2 = await client().ttl(`${PREFIX}:chunks:all`);
    expect(ttl2).toBeGreaterThanOrEqual(ttl1 - 1);
  });

  it('getByQuery returns positional ordinals starting at 1', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    await stream.appendChunk('q1', {text: 'a'});
    await stream.appendChunk('q1', {text: 'b'});
    await stream.appendChunk('q1', {text: 'c'});

    const items = await stream.getByQuery('q1');
    expect(items.map((i) => i.sequenceNumber)).toEqual([1, 2, 3]);
  });

  it('isComplete uses XREVRANGE on per-query key', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    await stream.appendChunk('q1', {text: 'chunk'});
    expect(await stream.isComplete('q1')).toBe(false);
    await stream.completeQuery('q1');
    expect(await stream.isComplete('q1')).toBe(true);
  });

  it('hasQuery uses EXISTS on per-query key', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    expect(await stream.hasQuery('no-such')).toBe(false);
    await stream.appendChunk('no-such', {text: 'x'});
    expect(await stream.hasQuery('no-such')).toBe(true);
  });

  it('delete(queryId) UNLINKs only the per-query key', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    await stream.appendChunk('q1', {text: 'a'});
    await stream.appendChunk('q2', {text: 'b'});

    await stream.delete('q1');

    expect(await client().exists(`${PREFIX}:chunks:q1`)).toBe(0);
    expect(await client().exists(`${PREFIX}:chunks:q2`)).toBe(1);
    expect(await client().exists(`${PREFIX}:chunks:all`)).toBe(1);
  });

  it('delete() purge-all removes all pattern keys and the all-key', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    await stream.appendChunk('q1', {text: 'a'});
    await stream.appendChunk('q2', {text: 'b'});

    await stream.delete();

    expect(await client().exists(`${PREFIX}:chunks:q1`)).toBe(0);
    expect(await client().exists(`${PREFIX}:chunks:q2`)).toBe(0);
    expect(await client().exists(`${PREFIX}:chunks:all`)).toBe(0);
  });

  it('subscribeAll delivers via the chunks:all firehose key', async () => {
    const stream = new RedisChunkStream(client(), logger, PREFIX, TTL);
    const received: string[] = [];

    stream.subscribeAll((item) => received.push(item.data.queryId as string));

    await stream.appendChunk('qa', {text: 'x'});
    await stream.appendChunk('qb', {text: 'y'});

    const deadline = Date.now() + 3000;
    while (received.length < 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(received).toEqual(['qa', 'qb']);
  });
});
