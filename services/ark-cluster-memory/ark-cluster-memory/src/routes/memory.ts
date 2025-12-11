import { Router } from 'express';
import { MemoryStore } from '../memory-store.js';

export function createMemoryRouter(memory: MemoryStore): Router {
  const router = Router();

  /**
   * @swagger
   * /messages:
   *   post:
   *     summary: Store messages in memory
   *     description: Stores chat messages for a specific conversation and query. If conversation_id is not provided, a new one will be generated.
   *     tags:
   *       - Memory
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - query_id
   *               - messages
   *             properties:
   *               conversation_id:
   *                 type: string
   *                 description: Conversation identifier (optional, will be generated if not provided)
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
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 conversation_id:
   *                   type: string
   *                   description: The conversation ID (generated if not provided in request)
   *       400:
   *         description: Invalid request parameters
   */
  router.post('/messages', (req, res) => {
    try {
      let { conversation_id, query_id, messages } = req.body;

      // Generate conversation_id if not provided
      if (!conversation_id) {
        conversation_id = `conv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      }

      console.log(`POST /messages - conversation_id: ${conversation_id}, query_id: ${query_id}, messages: ${messages?.length}`);

      if (!query_id) {
        res.status(400).json({ error: 'query_id is required' });
        return;
      }

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      // Store messages with full metadata
      memory.addMessagesWithMetadata(conversation_id, query_id, messages);

      // Return the conversation_id in the response
      res.status(200).json({ conversation_id });
    } catch (error) {
      console.error('Failed to add messages:', error);
      const err = error as Error;
      res.status(400).json({ error: err.message });
    }
  });

  // GET /messages - returns messages
  router.get('/messages', (req, res) => {
    try {
      const conversation_id = req.query.conversation_id as string;
      const query_id = req.query.query_id as string;

      const allMessages = memory.getAllMessages();
      // Filter out messages with null conversation_id (legacy data)
      let filteredMessages = allMessages.filter(m => m.conversation_id != null);

      // Apply filters if provided
      if (conversation_id) {
        filteredMessages = filteredMessages.filter(m => m.conversation_id === conversation_id);
      }

      if (query_id) {
        filteredMessages = filteredMessages.filter(m => m.query_id === query_id);
      }

      // Return messages in the expected format
      res.json({ messages: filteredMessages });
    } catch (error) {
      console.error('Failed to get messages:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  // GET /memory-status - returns memory statistics summary
  router.get('/memory-status', (req, res) => {
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
  router.delete('/messages', (req, res) => {
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
  router.delete('/conversations', (req, res) => {
    memory.purge();
    res.json({ status: 'success', message: 'All conversations deleted' });
  });

  /**
   * @swagger
   * /conversations/init:
   *   post:
   *     summary: Initialize or get a conversation ID
   *     description: Returns an existing conversation ID if provided, or generates a new one
   *     tags:
   *       - Memory
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               conversation_id:
   *                 type: string
   *                 description: Optional conversation ID to use. If not provided, a new one will be generated.
   *     responses:
   *       200:
   *         description: Conversation ID returned
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 conversation_id:
   *                   type: string
   *                   description: The conversation ID (provided or generated)
   */
  router.post('/conversations/init', (req, res) => {
    let conversation_id = req.body?.conversation_id;

    if (!conversation_id) {
      conversation_id = `conv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    res.json({ conversation_id });
  });

  return router;
}
