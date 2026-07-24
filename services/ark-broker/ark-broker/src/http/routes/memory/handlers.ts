import type {Request, Response} from 'express';
import {MemoryBroker} from '@ark-broker/brokers/memory-broker.js';
import {streamSSE} from '@ark-broker/http/sse.js';
import {
  parsePaginationParams,
  PaginationError,
  PaginatedList,
} from '@ark-broker/brokers/pagination.js';
import {
  sendPaginationError,
  sendInternalError,
} from '@ark-broker/http/routes/errors.js';

interface MessageItem {
  timestamp: string;
  conversation_id: string;
  query_id: string;
  message: unknown;
  sequence: number;
}

export function handleStreamingMessages(
  req: Request,
  res: Response,
  memory: MemoryBroker,
  conversationId: string | undefined,
  cursor: number | undefined
): void {
  req.log.info({cursor}, 'starting SSE stream for all messages');

  const getReplay =
    cursor === undefined
      ? undefined
      : async (): Promise<MessageItem[]> => {
          const items = await memory.messagesAfter(cursor, conversationId);
          return items.map((item) => ({
            timestamp: item.timestamp.toISOString(),
            conversation_id: item.data.conversationId,
            query_id: item.data.queryId,
            message: item.data.message,
            sequence: item.sequenceNumber,
          }));
        };

  streamSSE({
    res,
    req,
    logger: req.log,
    tag: 'MESSAGES',
    itemName: 'messages',
    subscribe: (callback) =>
      memory.subscribe((item) => {
        callback({
          timestamp: item.timestamp.toISOString(),
          conversation_id: item.data.conversationId,
          query_id: item.data.queryId,
          message: item.data.message,
          sequence: item.sequenceNumber,
        });
      }),
    getReplay,
    getSequence: (item: unknown): number =>
      (item as {sequence: number}).sequence,
    filter: conversationId
      ? (msg: unknown): boolean =>
          (msg as {conversation_id: string}).conversation_id === conversationId
      : undefined,
  });
}

export async function handlePaginatedMessages(
  req: Request,
  res: Response,
  memory: MemoryBroker,
  conversationId: string | undefined,
  queryId: string | undefined
): Promise<void> {
  try {
    const params = parsePaginationParams(req.query as Record<string, unknown>);

    const filters = {
      conversationId: conversationId || undefined,
      queryId: queryId || undefined,
    };

    const result = await memory.paginate(params, filters);

    const response: PaginatedList<MessageItem> = {
      items: result.items.map((item) => ({
        timestamp: item.timestamp.toISOString(),
        conversation_id: item.data.conversationId,
        query_id: item.data.queryId,
        message: item.data.message,
        sequence: item.sequenceNumber,
      })),
      total: result.total,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };

    res.json(response);
  } catch (error) {
    if (error instanceof PaginationError) {
      sendPaginationError(res, error, req.id);
      return;
    }
    req.log.error({err: error}, 'failed to get messages');
    sendInternalError(res, req.id);
  }
}
