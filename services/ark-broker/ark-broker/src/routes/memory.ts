import { Router } from 'express';
import { randomUUID } from 'crypto';
import { MemoryStore } from '../memory-store.js';
import { streamSSE } from '../sse.js';

export function createMemoryRouter(memory: MemoryStore): Router {
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
  router.post('/messages', (req, res) => {
    try {
      const { conversation_id, query_id, messages } = req.body;

      if (!conversation_id) {
        res.status(400).json({ error: 'conversation_id is required' });
        return;
      }

      if (!query_id) {
        res.status(400).json({ error: 'query_id is required' });
        return;
      }

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      console.log(`POST /messages - conversation_id: ${conversation_id}, query_id: ${query_id}, messages: ${messages?.length}`);

      memory.addMessagesWithMetadata(conversation_id, query_id, messages);

      res.status(200).send();
    } catch (error) {
      console.error('Failed to add messages:', error);
      const err = error as Error;
      res.status(400).json({ error: err.message });
    }
  });

  // GET /messages - returns messages or streams via SSE
  router.get('/messages', (req, res) => {
    const watch = req.query['watch'] === 'true';
    const conversation_id = req.query.conversation_id as string;

    if (watch) {
      console.log('[MESSAGES] GET /messages?watch=true - starting SSE stream for all messages');
      streamSSE({
        res,
        req,
        tag: 'MESSAGES',
        itemName: 'messages',
        subscribe: (callback) => memory.subscribeToAllMessages(callback),
        filter: conversation_id ? (msg) => msg.conversation_id === conversation_id : undefined
      });
    } else {
      try {
        const query_id = req.query.query_id as string;

        const allMessages = memory.getAllMessages();
        let filteredMessages = allMessages;

        if (conversation_id) {
          filteredMessages = filteredMessages.filter(m => m.conversation_id === conversation_id);
        }

        if (query_id) {
          filteredMessages = filteredMessages.filter(m => m.query_id === query_id);
        }

        res.json({ messages: filteredMessages });
      } catch (error) {
        console.error('Failed to get messages:', error);
        const err = error as Error;
        res.status(500).json({ error: err.message });
      }
    }
  });

  // GET /memory-status - returns memory statistics summary
  router.get('/memory-status', (_req, res) => {
    try {
      const conversations = memory.getAllConversations();
      const allMessages = memory.getAllMessages();

      // Get per-conversation statistics
      const conversationStats: any = {};
      for (const conversationId of conversations) {
        const messages = memory.getMessages(conversationId);
        const queries = new Set<string>();

        // Extract unique query IDs from messages
        for (const msg of allMessages) {
          if (msg.conversation_id === conversationId && msg.query_id) {
            queries.add(msg.query_id);
          }
        }

        conversationStats[conversationId] = {
          message_count: messages.length,
          query_count: queries.size
        };
      }

      res.json({
        total_conversations: conversations.length,
        total_messages: allMessages.length,
        conversations: conversationStats
      });
    } catch (error) {
      console.error('Failed to get memory status:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });


  // List conversations - GET /conversations
  router.get('/conversations', (req, res) => {
    try {
      // Get all unique conversation IDs from the memory store
      const conversations = memory.getAllConversations();
      res.json({ conversations });
    } catch (error) {
      console.error('Failed to get conversations:', error);
      const err = error as Error;
      res.status(400).json({ error: err.message });
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
    memory.purge();
    res.json({ status: 'success', message: 'Memory purged' });
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
  router.delete('/conversations/:conversationId', (req, res) => {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    memory.clearConversation(conversationId);
    res.json({ status: 'success', message: `Conversation ${conversationId} deleted` });
  });

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
  router.delete('/conversations/:conversationId/queries/:queryId/messages', (req, res) => {
    const { conversationId, queryId } = req.params;

    if (!conversationId) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    if (!queryId) {
      res.status(400).json({ error: 'Query ID is required' });
      return;
    }

    memory.clearQuery(conversationId, queryId);
    res.json({ status: 'success', message: `Query ${queryId} messages deleted from conversation ${conversationId}` });
  });

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
    memory.purge();
    res.json({ status: 'success', message: 'All conversations deleted' });
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
    res.status(201).json({ conversation_id });
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
  router.get('/conversations/:conversationId', (req, res) => {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    const messages = memory.getMessagesWithMetadata(conversationId);

    if (messages.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.json({
      conversation_id: conversationId,
      messages
    });
  });

  return router;
}
