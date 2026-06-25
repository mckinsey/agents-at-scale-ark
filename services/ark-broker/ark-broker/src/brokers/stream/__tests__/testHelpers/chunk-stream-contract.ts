import type {ChunkStream} from '../../chunk-stream.js';
import type {BrokerItem} from '../../broker-item.js';
import type {CompletionChunkData} from '../../chunk-stream.js';

const textChunk = {choices: [{delta: {content: 'hello'}}]};
const finishChunk = {choices: [{finish_reason: 'stop'}]};

async function waitUntilLength(
  arr: unknown[],
  expected: number,
  timeoutMs = 3000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (arr.length < expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

export function runChunkStreamContract(factory: () => ChunkStream): void {
  let stream: ChunkStream;

  beforeEach(() => {
    stream = factory();
  });

  describe('appendChunk / getByQuery', () => {
    it('stores chunks keyed by queryId', async () => {
      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q1', finishChunk);
      await stream.appendChunk('q2', textChunk);

      const q1 = await stream.getByQuery('q1');
      const q2 = await stream.getByQuery('q2');

      expect(q1).toHaveLength(2);
      expect(q2).toHaveLength(1);
    });

    it('assigns ascending sequenceNumbers', async () => {
      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q1', finishChunk);

      const items = await stream.getByQuery('q1');
      expect(items[1].sequenceNumber).toBeGreaterThan(items[0].sequenceNumber);
    });

    it('stores timestamp as Date', async () => {
      await stream.appendChunk('q1', textChunk);
      const [item] = await stream.getByQuery('q1');
      expect(item.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('completeQuery / isComplete', () => {
    it('marks query as complete', async () => {
      await stream.appendChunk('q1', textChunk);
      expect(await stream.isComplete('q1')).toBe(false);

      await stream.completeQuery('q1');
      expect(await stream.isComplete('q1')).toBe(true);
    });

    it('appends a complete item with complete===true', async () => {
      await stream.completeQuery('q1');
      const items = await stream.getByQuery('q1');
      const last = items.at(-1)!;
      expect(last.data.complete).toBe(true);
    });

    it('returns false for unknown queryId', async () => {
      expect(await stream.isComplete('unknown')).toBe(false);
    });
  });

  describe('hasQuery', () => {
    it('returns true after appendChunk', async () => {
      await stream.appendChunk('q1', textChunk);
      expect(await stream.hasQuery('q1')).toBe(true);
    });

    it('returns false for unknown queryId', async () => {
      expect(await stream.hasQuery('unknown')).toBe(false);
    });
  });

  describe('subscribeToQuery', () => {
    it('fires callback for matching queryId only', async () => {
      const received: unknown[] = [];
      stream.subscribeToQuery('q1', (item: BrokerItem<CompletionChunkData>) =>
        received.push(item.data.chunk)
      );

      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q2', finishChunk);

      await waitUntilLength(received, 1);
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(textChunk);
    });

    it('fires with complete===true on completeQuery', async () => {
      const flags: (boolean | undefined)[] = [];
      stream.subscribeToQuery('q1', (item: BrokerItem<CompletionChunkData>) =>
        flags.push(item.data.complete)
      );

      await stream.appendChunk('q1', textChunk);
      await stream.completeQuery('q1');

      await waitUntilLength(flags, 2);
      expect(flags).toHaveLength(2);
      expect(flags[1]).toBe(true);
    });

    it('unsubscribe stops callbacks', async () => {
      const received: unknown[] = [];
      const unsub = stream.subscribeToQuery(
        'q1',
        (item: BrokerItem<CompletionChunkData>) =>
          received.push(item.data.chunk)
      );

      await stream.appendChunk('q1', textChunk);
      await waitUntilLength(received, 1);
      unsub();
      await stream.appendChunk('q1', finishChunk);

      await new Promise((r) => setTimeout(r, 100));
      expect(received).toHaveLength(1);
    });
  });

  describe('subscribeAll', () => {
    it('fires for all queries', async () => {
      const received: string[] = [];
      stream.subscribeAll((item: BrokerItem<CompletionChunkData>) =>
        received.push(item.data.queryId)
      );

      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q2', finishChunk);

      await waitUntilLength(received, 2);
      expect(received).toEqual(['q1', 'q2']);
    });

    it('unsubscribe stops callbacks', async () => {
      const received: unknown[] = [];
      const unsub = stream.subscribeAll(
        (item: BrokerItem<CompletionChunkData>) =>
          received.push(item.data.chunk)
      );

      await stream.appendChunk('q1', textChunk);
      await waitUntilLength(received, 1);
      unsub();
      await stream.appendChunk('q1', finishChunk);

      await new Promise((r) => setTimeout(r, 100));
      expect(received).toHaveLength(1);
    });
  });

  describe('all', () => {
    it('returns all items across queries', async () => {
      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q2', finishChunk);

      const all = await stream.all();
      expect(all).toHaveLength(2);
    });
  });

  describe('paginate', () => {
    it('paginates globally without queryId', async () => {
      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q2', finishChunk);

      const result = await stream.paginate({limit: 1});
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it('paginates by queryId', async () => {
      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q2', finishChunk);
      await stream.appendChunk('q1', finishChunk);

      const result = await stream.paginate({limit: 10}, 'q1');
      expect(result.items).toHaveLength(2);
      result.items.forEach((item) => expect(item.data.queryId).toBe('q1'));
    });

    it('returns items after cursor', async () => {
      const a = await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q1', finishChunk);

      const result = await stream.paginate(
        {limit: 10, cursor: a.sequenceNumber},
        'q1'
      );
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getCurrentSequence', () => {
    it('returns 0 before any appends', async () => {
      const seq = await stream.getCurrentSequence();
      expect(seq).toBeGreaterThanOrEqual(0);
    });

    it('increases after appends', async () => {
      const before = await stream.getCurrentSequence();
      await stream.appendChunk('q1', textChunk);
      const after = await stream.getCurrentSequence();
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('delete', () => {
    it('purges all items when called without queryId', async () => {
      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q2', finishChunk);

      await stream.delete();

      expect(await stream.all()).toHaveLength(0);
    });

    it('purges only the specified query when called with queryId', async () => {
      await stream.appendChunk('q1', textChunk);
      await stream.appendChunk('q2', finishChunk);

      await stream.delete('q1');

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0].data.queryId).toBe('q2');
    });
  });
}
