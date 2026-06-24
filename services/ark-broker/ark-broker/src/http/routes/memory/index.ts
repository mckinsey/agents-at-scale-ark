import {Router} from 'express';
import {randomUUID} from 'crypto';
import {MemoryBroker} from '@ark-broker/brokers/memory-broker.js';
import {SessionsBroker} from '@ark-broker/brokers/sessions-broker.js';
import {
  sendValidationError,
  sendInternalError,
} from '@ark-broker/http/routes/errors.js';
import {
  postMessagesBodySchema,
  PostMessagesBody,
  getMessagesQuerySchema,
  GetMessagesQuery,
  GetMessagesQueryRaw,
} from './schemas.js';
import {handleStreamingMessages, handlePaginatedMessages} from './handlers.js';

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
    async (req, res) => {
      const parse = postMessagesBodySchema.safeParse(req.body);
      if (!parse.success) {
        sendValidationError(res, parse.error, req.id);
        return;
      }
      const {
        conversation_id,
        query_id,
        messages,
        ttl_seconds,
      }: PostMessagesBody = parse.data;

      try {
        req.log.info(
          {
            conversationId: conversation_id,
            queryId: query_id,
            count: messages.length,
          },
          'received messages'
        );

        await memory.addMessages(
          conversation_id,
          query_id,
          messages,
          ttl_seconds
        );
        await memory.save();

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
    async (req, res) => {
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
        await handlePaginatedMessages(
          req,
          res,
          memory,
          conversationId,
          queryId
        );
      }
    }
  );

  router.get('/memory-status', async (req, res) => {
    try {
      const conversationIds = await memory.getConversationIds();
      const allItems = await memory.all();

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

  router.get('/conversations', async (req, res) => {
    try {
      const conversations = await memory.getConversationIds();
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
  router.delete('/messages', async (_req, res) => {
    await memory.delete();
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
    async (req, res) => {
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

      await memory.deleteConversation(conversationId);
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
    async (req, res) => {
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

      await memory.deleteQuery(conversationId, queryId);
      res.json({
        status: 'success',
        message: `Query ${queryId} messages deleted from conversation ${conversationId}`,
      });
    }
  );

  /**
   * @swagger
   * /queries/{queryId}/messages:
   *   delete:
   *     summary: Delete all messages for a specific query
   *     description: Removes all messages for a specific query across all conversations
   *     tags:
   *       - Memory
   *     parameters:
   *       - in: path
   *         name: queryId
   *         required: true
   *         schema:
   *           type: string
   *         description: Query ID to delete messages for
   *     responses:
   *       200:
   *         description: Query messages deleted successfully
   *       400:
   *         description: Invalid query ID
   *       500:
   *         description: Failed to delete query messages
   */
  router.delete<{queryId: string}>(
    '/queries/:queryId/messages',
    async (req, res) => {
      const {queryId} = req.params;

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

      try {
        req.log.info({queryId}, 'deleting messages for query');
        await memory.deleteByQuery(queryId);
        res.json({
          status: 'success',
          message: `Query ${queryId} messages deleted`,
        });
      } catch (error) {
        req.log.error({err: error}, 'failed to delete query messages');
        sendInternalError(res, req.id);
      }
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
  router.delete('/conversations', async (_req, res) => {
    await memory.delete();
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
    async (req, res) => {
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

      const items = await memory.getByConversation(conversationId);

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
