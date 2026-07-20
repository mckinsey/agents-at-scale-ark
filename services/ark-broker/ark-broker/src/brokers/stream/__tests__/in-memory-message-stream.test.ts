import {createLogger} from '@ark-broker/logging/logger.js';
import {InMemoryMessageStream} from '../in-memory-message-stream.js';
import {makeMessageData} from './testHelpers/message-data-factory.js';

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('InMemoryMessageStream', () => {
  let stream: InMemoryMessageStream;

  beforeEach(() => {
    stream = new InMemoryMessageStream(silentLogger, 'test-messages');
  });

  describe('filterBy', () => {
    it('returns only items matching conversationId, in sequence order', async () => {
      const conversationId = 'conv-a';
      const a = await stream.append(makeMessageData({conversationId}));
      const b = await stream.append(makeMessageData({conversationId}));
      await stream.append(makeMessageData());

      const result = await stream.filterBy({conversationId});

      expect(result.map((item) => item.sequenceNumber)).toEqual([
        a.sequenceNumber,
        b.sequenceNumber,
      ]);
    });

    it('returns only items matching queryId', async () => {
      const queryId = 'query-a';
      const a = await stream.append(makeMessageData({queryId}));
      await stream.append(makeMessageData());

      const result = await stream.filterBy({queryId});

      expect(result).toHaveLength(1);
      expect(result[0]!.sequenceNumber).toBe(a.sequenceNumber);
    });

    it('combines conversationId and queryId as AND', async () => {
      const conversationId = 'conv-a';
      const queryId = 'query-a';
      const match = await stream.append(
        makeMessageData({conversationId, queryId})
      );
      await stream.append(makeMessageData({conversationId}));
      await stream.append(makeMessageData({queryId}));

      const result = await stream.filterBy({conversationId, queryId});

      expect(result).toHaveLength(1);
      expect(result[0]!.sequenceNumber).toBe(match.sequenceNumber);
    });

    it('applies afterSequence as a keyset cursor', async () => {
      const conversationId = 'conv-a';
      const a = await stream.append(makeMessageData({conversationId}));
      const b = await stream.append(makeMessageData({conversationId}));
      const c = await stream.append(makeMessageData({conversationId}));

      const result = await stream.filterBy({
        conversationId,
        afterSequence: a.sequenceNumber,
      });

      expect(result.map((item) => item.sequenceNumber)).toEqual([
        b.sequenceNumber,
        c.sequenceNumber,
      ]);
    });
  });

  describe('paginateBy', () => {
    it('returns only items matching the filter', async () => {
      const conversationId = 'conv-a';
      await stream.append(makeMessageData({conversationId}));
      await stream.append(makeMessageData({conversationId}));
      await stream.append(makeMessageData());

      const result = await stream.paginateBy({limit: 10}, {conversationId});

      expect(result.items).toHaveLength(2);
      expect(
        result.items.every(
          (item) => item.data.conversationId === conversationId
        )
      ).toBe(true);
    });

    it('paginates a filtered subset across multiple keyset pages', async () => {
      const conversationId = 'conv-a';
      const appended = [];
      for (let i = 0; i < 5; i++) {
        appended.push(await stream.append(makeMessageData({conversationId})));
      }
      await stream.append(makeMessageData());

      const page1 = await stream.paginateBy({limit: 2}, {conversationId});
      expect(page1.items.map((item) => item.sequenceNumber)).toEqual([
        appended[0]!.sequenceNumber,
        appended[1]!.sequenceNumber,
      ]);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBe(appended[1]!.sequenceNumber);

      const page2 = await stream.paginateBy(
        {limit: 2, cursor: page1.nextCursor},
        {conversationId}
      );
      expect(page2.items.map((item) => item.sequenceNumber)).toEqual([
        appended[2]!.sequenceNumber,
        appended[3]!.sequenceNumber,
      ]);
      expect(page2.hasMore).toBe(true);

      const page3 = await stream.paginateBy(
        {limit: 2, cursor: page2.nextCursor},
        {conversationId}
      );
      expect(page3.items.map((item) => item.sequenceNumber)).toEqual([
        appended[4]!.sequenceNumber,
      ]);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeUndefined();
    });

    it('works without a filter, mirroring paginate', async () => {
      for (let i = 0; i < 3; i++) {
        await stream.append(makeMessageData());
      }
      const result = await stream.paginateBy({limit: 10});
      expect(result.items).toHaveLength(3);
    });
  });

  describe('deleteBy', () => {
    it('removes only rows matching conversationId, leaving others intact', async () => {
      const convA = 'conv-a';
      const convB = 'conv-b';
      await stream.append(makeMessageData({conversationId: convA}));
      await stream.append(makeMessageData({conversationId: convA}));
      const survivor = await stream.append(
        makeMessageData({conversationId: convB})
      );

      await stream.deleteBy({conversationId: convA});

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.sequenceNumber).toBe(survivor.sequenceNumber);
    });

    it('removes only rows matching queryId, leaving others intact', async () => {
      const queryA = 'query-a';
      const queryB = 'query-b';
      await stream.append(makeMessageData({queryId: queryA}));
      const survivor = await stream.append(makeMessageData({queryId: queryB}));

      await stream.deleteBy({queryId: queryA});

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.sequenceNumber).toBe(survivor.sequenceNumber);
    });

    it('rejects an empty filter without deleting anything', async () => {
      await stream.append(makeMessageData());
      await expect(stream.deleteBy({})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });

    it('rejects an empty-string conversationId without deleting anything', async () => {
      await stream.append(makeMessageData());
      await expect(stream.deleteBy({conversationId: ''})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });

    it('rejects an empty-string queryId without deleting anything', async () => {
      await stream.append(makeMessageData());
      await expect(stream.deleteBy({queryId: ''})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });
  });

  describe('appendMany', () => {
    it('returns [] without appending anything for an empty array', async () => {
      const items = await stream.appendMany([]);
      expect(items).toEqual([]);
      expect(await stream.all()).toHaveLength(0);
    });

    it('appends all messages in order and returns matching items', async () => {
      const dataList = [
        makeMessageData(),
        makeMessageData(),
        makeMessageData(),
      ];

      const items = await stream.appendMany(dataList);

      expect(items.map((item) => item.sequenceNumber)).toEqual([1, 2, 3]);
      expect(items.map((item) => item.data)).toEqual(dataList);
    });

    it('emits one item event per message', async () => {
      const received: number[] = [];
      stream.subscribe((item) => received.push(item.sequenceNumber));

      await stream.appendMany([makeMessageData(), makeMessageData()]);

      expect(received).toEqual([1, 2]);
    });
  });

  describe('distinctConversationIds', () => {
    it('returns empty array when stream is empty', async () => {
      expect(await stream.distinctConversationIds()).toEqual([]);
    });

    it('returns each conversation id once', async () => {
      await stream.append(makeMessageData({conversationId: 'conv-a'}));
      await stream.append(makeMessageData({conversationId: 'conv-a'}));
      await stream.append(makeMessageData({conversationId: 'conv-b'}));

      const ids = await stream.distinctConversationIds();

      expect(ids.sort()).toEqual(['conv-a', 'conv-b']);
    });
  });

  describe('conversationStats', () => {
    it('returns empty array when stream is empty', async () => {
      expect(await stream.conversationStats()).toEqual([]);
    });

    it('counts messages and distinct queries per conversation', async () => {
      await stream.append(
        makeMessageData({conversationId: 'conv-a', queryId: 'query-a1'})
      );
      await stream.append(
        makeMessageData({conversationId: 'conv-a', queryId: 'query-a1'})
      );
      await stream.append(
        makeMessageData({conversationId: 'conv-a', queryId: 'query-a2'})
      );
      await stream.append(
        makeMessageData({conversationId: 'conv-b', queryId: 'query-b1'})
      );

      const stats = await stream.conversationStats();
      const byConversation = new Map(
        stats.map((stat) => [stat.conversationId, stat])
      );

      expect(byConversation.get('conv-a')).toEqual({
        conversationId: 'conv-a',
        messageCount: 3,
        queryCount: 2,
      });
      expect(byConversation.get('conv-b')).toEqual({
        conversationId: 'conv-b',
        messageCount: 1,
        queryCount: 1,
      });
    });
  });
});
