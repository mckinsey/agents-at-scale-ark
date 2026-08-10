import type Redis from 'ioredis';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {
  PaginatedList,
  PaginationParams,
} from '@ark-broker/brokers/pagination.js';
import {DEFAULT_LIMIT} from '@ark-broker/brokers/pagination.js';
import type {BrokerItem} from './broker-item.js';
import type {ChunkStream, CompletionChunkData} from './chunk-stream.js';

const GLOBAL_STREAM_CAP = 100_000;

function makeQKey(prefix: string, queryId: string): string {
  return `${prefix}:chunks:${queryId}`;
}

function makeAllKey(prefix: string): string {
  return `${prefix}:chunks:all`;
}

function parseFields(fields: string[]): CompletionChunkData {
  const idx = fields.indexOf('d');
  return JSON.parse(fields[idx + 1]) as CompletionChunkData;
}

function entryToItem(
  id: string,
  fields: string[],
  ordinal: number
): BrokerItem<CompletionChunkData> {
  const [msStr] = id.split('-');
  return {
    sequenceNumber: ordinal,
    timestamp: new Date(parseInt(msStr, 10)),
    data: parseFields(fields),
  };
}

export class RedisChunkStream implements ChunkStream {
  private readonly prefix: string;
  private readonly ttlSeconds: number;
  private readonly logger: Logger;

  constructor(
    private readonly redis: Redis,
    logger: Logger,
    prefix: string,
    ttlSeconds: number
  ) {
    this.prefix = prefix;
    this.ttlSeconds = ttlSeconds;
    this.logger = logger.child({module: 'redis-chunk-stream'});
  }

  async appendChunk(
    queryId: string,
    chunk: unknown
  ): Promise<BrokerItem<CompletionChunkData>> {
    return this.appendItem(queryId, {queryId, chunk});
  }

  async completeQuery(
    queryId: string
  ): Promise<BrokerItem<CompletionChunkData>> {
    return this.appendItem(queryId, {queryId, chunk: '[DONE]', complete: true});
  }

  private async appendItem(
    queryId: string,
    data: CompletionChunkData
  ): Promise<BrokerItem<CompletionChunkData>> {
    const qKey = makeQKey(this.prefix, queryId);
    const allKey = makeAllKey(this.prefix);
    const payload = JSON.stringify(data);

    const pipeline = this.redis.multi();
    pipeline.xadd(qKey, '*', 'd', payload);
    pipeline.xadd(
      allKey,
      'MAXLEN',
      '~',
      String(GLOBAL_STREAM_CAP),
      '*',
      'd',
      payload
    );
    pipeline.expire(qKey, this.ttlSeconds);
    pipeline.expire(allKey, this.ttlSeconds);
    const results = await pipeline.exec();

    const entryId = results?.[0]?.[1] as string | null;
    const len = await this.redis.xlen(qKey);
    const [msStr] = (entryId ?? '0-0').split('-');

    return {
      sequenceNumber: len,
      timestamp: new Date(parseInt(msStr, 10)),
      data,
    };
  }

  async getByQuery(
    queryId: string
  ): Promise<BrokerItem<CompletionChunkData>[]> {
    const qKey = makeQKey(this.prefix, queryId);
    const entries = await this.redis.xrange(qKey, '-', '+');
    return entries.map(([id, fields], i) => entryToItem(id, fields, i + 1));
  }

  async isComplete(queryId: string): Promise<boolean> {
    const qKey = makeQKey(this.prefix, queryId);
    const entries = await this.redis.xrevrange(qKey, '+', '-', 'COUNT', '1');
    if (entries.length === 0) return false;
    const [, fields] = entries[0];
    const data = parseFields(fields);
    return data.complete === true;
  }

  async hasQuery(queryId: string): Promise<boolean> {
    const qKey = makeQKey(this.prefix, queryId);
    return (await this.redis.exists(qKey)) === 1;
  }

  subscribeToQuery(
    queryId: string,
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    const qKey = makeQKey(this.prefix, queryId);
    return this.startXreadLoop(qKey, callback);
  }

  subscribeAll(
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    const allKey = makeAllKey(this.prefix);
    return this.startXreadLoop(allKey, callback);
  }

  private startXreadLoop(
    key: string,
    callback: (item: BrokerItem<CompletionChunkData>) => void
  ): () => void {
    let aborted = false;
    const sub = this.redis.duplicate();
    let baseOrdinal = 0;
    let ordinalCounter = 0;

    const run = async (): Promise<void> => {
      const [existing, len] = await Promise.all([
        this.redis.xrevrange(key, '+', '-', 'COUNT', '1'),
        this.redis.xlen(key),
      ]);
      let lastId = existing.length > 0 ? existing[0][0] : '0-0';
      baseOrdinal = len;

      while (!aborted) {
        let result: [string, [string, string[]][]][] | null;
        try {
          result = (await sub.xread(
            'COUNT',
            100,
            'BLOCK',
            5000,
            'STREAMS',
            key,
            lastId
          )) as [string, [string, string[]][]][] | null;
        } catch (err) {
          if (!aborted) {
            this.logger.error({err}, 'xread error');
          }
          break;
        }

        if (!result) continue;

        for (const [, entries] of result) {
          for (const [id, fields] of entries) {
            if (aborted) break;
            lastId = id;
            ordinalCounter++;
            callback(entryToItem(id, fields, baseOrdinal + ordinalCounter));
          }
        }
      }

      await sub.disconnect();
      await sub.quit();
    };

    run().catch((err: Error) => {
      if (!aborted) this.logger.error({err}, 'xread loop crashed');
    });

    return (): void => {
      aborted = true;
    };
  }

  async all(): Promise<BrokerItem<CompletionChunkData>[]> {
    const allKey = makeAllKey(this.prefix);
    const entries = await this.redis.xrange(allKey, '-', '+');
    return entries.map(([id, fields], i) => entryToItem(id, fields, i + 1));
  }

  async paginate(
    params: PaginationParams,
    queryId?: string
  ): Promise<PaginatedList<BrokerItem<CompletionChunkData>>> {
    const key = queryId
      ? makeQKey(this.prefix, queryId)
      : makeAllKey(this.prefix);
    const limit = params.limit ?? DEFAULT_LIMIT;
    const cursor = params.cursor;

    const allEntries = await this.redis.xrange(key, '-', '+');
    const allItems = allEntries.map(([id, fields], i) =>
      entryToItem(id, fields, i + 1)
    );
    const total = allItems.length;

    const filtered =
      cursor !== undefined
        ? allItems.filter((item) => item.sequenceNumber > cursor)
        : allItems;

    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor =
      page.length > 0 ? page.at(-1)!.sequenceNumber : undefined;

    return {
      items: page,
      total,
      hasMore,
      nextCursor: hasMore ? nextCursor : undefined,
    };
  }

  async getCurrentSequence(): Promise<number> {
    const allKey = makeAllKey(this.prefix);
    return this.redis.xlen(allKey);
  }

  async delete(queryId?: string): Promise<void> {
    if (queryId) {
      const allKey = makeAllKey(this.prefix);
      const allEntries = await this.redis.xrange(allKey, '-', '+');
      const idsToDelete = allEntries
        .filter(([, fields]) => {
          try {
            return parseFields(fields).queryId === queryId;
          } catch {
            return false;
          }
        })
        .map(([id]) => id);
      await Promise.all([
        idsToDelete.length > 0
          ? this.redis.xdel(allKey, ...idsToDelete)
          : Promise.resolve(),
        this.redis.unlink(makeQKey(this.prefix, queryId)),
      ]);
      return;
    }
    const allKey = makeAllKey(this.prefix);
    const pattern = `${this.prefix}:chunks:*`;
    let cursor = '0';
    const keys: string[] = [];
    do {
      const [nextCursor, found] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
    await this.redis.unlink(allKey);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}
