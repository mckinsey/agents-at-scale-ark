import {Router} from 'express';
import type {Request, Response} from 'express';
import {
  sendValidationError,
  sendPaginationError,
  sendInternalError,
} from './errors.js';
import {randomUUID} from 'crypto';
import {z} from 'zod';
import {MemoryBroker} from '../memory-broker.js';
import {SessionsBroker} from '../sessions-broker.js';
import {streamSSE} from '../sse.js';
import {
  parsePaginationParams,
  PaginationError,
  PaginatedList,
} from '../pagination.js';

const postMessagesBodySchema = z.object({
  conversation_id: z.string(),
  query_id: z.string(),
  messages: z.array(z.unknown()),
});
type PostMessagesBody = z.infer<typeof postMessagesBodySchema>;

const getMessagesQuerySchema = z.object({
  watch: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  conversation_id: z.string().optional(),
  query_id: z.string().optional(),
  cursor: z.coerce.number().int().nonnegative().optional(),
});
type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
type GetMessagesQueryRaw = {
  watch?: 'true' | 'false';
  conversation_id?: string;
  query_id?: string;
  cursor?: string;
};

interface MessageItem {
  timestamp: string;
  conversation_id: string;
  query_id: string;
  message: unknown;
  sequence: number;
}

function handleStreamingMessages(
  req: Request,
  res: Response,
  memory: MemoryBroker,
  conversationId: string | undefined,
  cursor: number | undefined
): void {
  req.log.info({cursor}, 'starting SSE stream for all messages');

  let replayItems: MessageItem[] | undefined;
  if (cursor !== undefined) {
    let items = memory.all().filter((item) => item.sequenceNumber > cursor);
    if (conversationId) {
      items = items.filter(
        (item) => item.data.conversationId === conversationId
      );
    }
    replayItems = items.map((item) => ({
      timestamp: item.timestamp.toISOString(),
      conversation_id: item.data.conversationId,
      query_id: item.data.queryId,
      message: item.data.message,
      sequence: item.sequenceNumber,
    }));
  }

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
    filter: conversationId
      ? (msg: unknown): boolean =>
          (msg as {conversation_id: string}).conversation_id === conversationId
      : undefined,
    replayItems,
  });
}

function handlePaginatedMessages(
  req: Request,
  res: Response,
  memory: MemoryBroker,
  conversationId: string | undefined,
  queryId: string | undefined
): void {
  try {
    const params = parsePaginationParams(req.query as Record<string, unknown>);

    const filters = {
      conversationId: conversationId || undefined,
      queryId: queryId || undefined,
    };

    const result = memory.paginate(params, filters);

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

export function createMemoryRouter(
  memory: MemoryBroker,
  sessions?: SessionsBroker
): Router {
  const router = Router();

  /**
   * @swagger
   * /messages:
   *   post:
   *     summary: Store messages in memory
   *     description: Stores chat messages for a specific conversation and query. Requires a conversation_id obtained from POST /conversations.
   *     tags:
   *       - Memory
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - conversation_id
   *               - query_id
   *               - messages
   *             properties:
   *               conversation_id:
   *                 type: string
   *                 description: Conversation identifier (required, obtain from POST /conversations)
   *               query_id:
   *                 type: string
   *                 description: Query identifier
   *               messages:
   *                 type: array
   *                 description: Array of OpenAI-format messages
   *                 items:
   *                   type: object
   *     responses:
   *       200:
   *         description: Messages stored successfully
   *       400:
   *         description: Invalid request parameters
   */
  router.post<Record<string, string>, unknown, PostMessagesBody>(
    '/messages',
    (req, res) => {
      const parse = postMessagesBodySchema.safeParse(req.body);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id);
        return;
      }
      const {conversation_id, query_id, messages}: PostMessagesBody =
        parse.data;

      try {
        req.log.info(
          {
            conversationId: conversation_id,
            queryId: query_id,
            count: messages.length,
          },
          'received messages'
        );

        memory.addMessages(conversation_id, query_id, messages);
        memory.save();

        if (sessions && conversation_id) {
          sessions.applyMessage(conversation_id, query_id);
        }

        res.status(200).send();
      } catch (error) {
        req.log.error({err: error}, 'failed to add messages');
        sendInternalError(res, req.id);
      }
    }
  );

  router.get<Record<string, string>, unknown, unknown, GetMessagesQueryRaw>(
    '/messages',
    (req, res) => {
      const parse = getMessagesQuerySchema.safeParse(req.query);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id);
        return;
      }
      const {
        watch,
        conversation_id: conversationId,
        query_id: queryId,
        cursor,
      }: GetMessagesQuery = parse.data;

      if (watch) {
        handleStreamingMessages(req, res, memory, conversationId, cursor);
      } else {
        handlePaginatedMessages(req, res, memory, conversationId, queryId);
      }
    }
  );

  router.get('/memory-status', (req, res) => {
    try {
      const conversationIds = memory.getConversationIds();
      const allItems = memory.all();

      const conversationStats: Record<
        string,
        {message_count: number; query_count: number}
      > = {};
      for (const conversationId of conversationIds) {
        const convItems = allItems.filter(
          (i) => i.data.conversationId === conversationId
        );
        const queryIds = new Set(convItems.map((i) => i.data.queryId));

        conversationStats[conversationId] = {
          message_count: convItems.length,
          query_count: queryIds.size,
        };
      }

      res.json({
        total_conversations: conversationIds.length,
        total_messages: allItems.length,
        conversations: conversationStats,
      });
    } catch (error) {
      req.log.error({err: error}, 'failed to get memory status');
      sendInternalError(res, req.id);
    }
  });

  router.get('/conversations', (req, res) => {
    try {
      const conversations = memory.getConversationIds();
      res.json({conversations});
    } catch (error) {
      req.log.error({err: error}, 'failed to get conversations');
      sendInternalError(res, req.id);
    }
  });

  /**
   * @swagger
   * /messages:
   *   delete:
   *     summary: Purge all memory data
   *     description: Clears all stored messages and saves empty state to disk
   *     tags:
   *       - Memory
   *     responses:
   *       200:
   *         description: Memory purged successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Memory purged
   *       500:
   *         description: Failed to purge memory
   */
  router.delete('/messages', (_req, res) => {
    memory.delete();
    res.json({status: 'success', message: 'Memory purged'});
  });

  /**
   * @swagger
   * /conversations/{conversationId}:
   *   delete:
   *     summary: Delete a specific conversation
   *     description: Removes all messages for a specific conversation
   *     tags:
   *       - Memory
   *     parameters:
   *       - in: path
   *         name: conversationId
   *         required: true
   *         schema:
   *           type: string
   *         description: Conversation ID to delete
   *     responses:
   *       200:
   *         description: Conversation deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Conversation deleted
   *       400:
   *         description: Invalid conversation ID
   *       500:
   *         description: Failed to delete conversation
   */
  router.delete<{conversationId: string}>(
    '/conversations/:conversationId',
    (req, res) => {
      const {conversationId} = req.params;

      if (!conversationId) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Conversation ID is required',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }

      memory.deleteConversation(conversationId);
      res.json({
        status: 'success',
        message: `Conversation ${conversationId} deleted`,
      });
    }
  );

  /**
   * @swagger
   * /conversations/{conversationId}/queries/{queryId}/messages:
   *   delete:
   *     summary: Delete messages for a specific query
   *     description: Removes all messages for a specific query within a conversation
   *     tags:
   *       - Memory
   *     parameters:
   *       - in: path
   *         name: conversationId
   *         required: true
   *         schema:
   *           type: string
   *         description: Conversation ID
   *       - in: path
   *         name: queryId
   *         required: true
   *         schema:
   *           type: string
   *         description: Query ID to delete messages for
   *     responses:
   *       200:
   *         description: Query messages deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Query messages deleted
   *       400:
   *         description: Invalid parameters
   *       500:
   *         description: Failed to delete query messages
   */
  router.delete<{conversationId: string; queryId: string}>(
    '/conversations/:conversationId/queries/:queryId/messages',
    (req, res) => {
      const {conversationId, queryId} = req.params;

      if (!conversationId) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Conversation ID is required',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }

      if (!queryId) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Query ID is required',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }

      memory.deleteQuery(conversationId, queryId);
      res.json({
        status: 'success',
        message: `Query ${queryId} messages deleted from conversation ${conversationId}`,
      });
    }
  );

  /**
   * @swagger
   * /conversations:
   *   delete:
   *     summary: Delete all conversations
   *     description: Removes all conversations and their messages (same as purging memory)
   *     tags:
   *       - Memory
   *     responses:
   *       200:
   *         description: All conversations deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: All conversations deleted
   *       500:
   *         description: Failed to delete conversations
   */
  router.delete('/conversations', (_req, res) => {
    memory.delete();
    res.json({status: 'success', message: 'All conversations deleted'});
  });

  /**
   * @swagger
   * /conversations:
   *   post:
   *     summary: Create a new conversation
   *     description: Creates a new conversation and returns its ID. Use this ID for subsequent POST /messages calls.
   *     tags:
   *       - Memory
   *     responses:
   *       201:
   *         description: Conversation created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 conversation_id:
   *                   type: string
   *                   description: The generated conversation ID (UUID v4)
   */
  router.post('/conversations', (_req, res) => {
    const conversation_id = randomUUID();
    res.status(201).json({conversation_id});
  });

  /**
   * @swagger
   * /conversations/{conversationId}:
   *   get:
   *     summary: Get conversation details
   *     description: Returns messages and metadata for a specific conversation
   *     tags:
   *       - Memory
   *     parameters:
   *       - in: path
   *         name: conversationId
   *         required: true
   *         schema:
   *           type: string
   *         description: Conversation ID
   *     responses:
   *       200:
   *         description: Conversation details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 conversation_id:
   *                   type: string
   *                 messages:
   *                   type: array
   *       404:
   *         description: Conversation not found
   */
  router.get<{conversationId: string}>(
    '/conversations/:conversationId',
    (req, res) => {
      const {conversationId} = req.params;

      if (!conversationId) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Conversation ID is required',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }

      const items = memory.getByConversation(conversationId);

      if (items.length === 0) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Conversation not found',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }

      const messages = items.map((item) => ({
        timestamp: item.timestamp.toISOString(),
        conversation_id: item.data.conversationId,
        query_id: item.data.queryId,
        message: item.data.message,
        sequence: item.sequenceNumber,
      }));

      res.json({
        conversation_id: conversationId,
        messages,
      });
    }
  );

  return router;
}
