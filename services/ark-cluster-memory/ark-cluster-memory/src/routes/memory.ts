import { Router } from 'express';
import { MemoryStore } from '../memory-store.js';

export function createMemoryRouter(memory: MemoryStore): Router {
  const router = Router();

  /**
   * @swagger
   * /messages:
   *   post:
   *     summary: Store messages in memory
   *     description: Stores chat messages for a specific session and query
   *     tags:
   *       - Memory
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - session_id
   *               - query_id
   *               - messages
   *             properties:
   *               session_id:
   *                 type: string
   *                 description: Session identifier
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
      const { session_id, query_id, messages } = req.body;
      
      console.log(`POST /messages - session_id: ${session_id}, query_id: ${query_id}, messages: ${messages?.length}`);
      
      if (!session_id) {
        res.status(400).json({ error: 'session_id is required' });
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
      
      // Store messages with full metadata
      memory.addMessagesWithMetadata(session_id, query_id, messages);
      res.status(200).send();
    } catch (error) {
      console.error('Failed to add messages:', error);
      const err = error as Error;
      res.status(400).json({ error: err.message });
    }
  });

  // GET /messages - returns messages
  router.get('/messages', (req, res) => {
    try {
      const session_id = req.query.session_id as string;
      const query_id = req.query.query_id as string;
      
      const allMessages = memory.getAllMessages();
      let filteredMessages = allMessages;
      
      // Apply filters if provided
      if (session_id) {
        filteredMessages = filteredMessages.filter(m => m.session_id === session_id);
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
      const sessions = memory.getAllSessions();
      const allMessages = memory.getAllMessages();
      
      // Get per-session statistics
      const sessionStats: any = {};
      for (const sessionId of sessions) {
        const messages = memory.getMessages(sessionId);
        const queries = new Set<string>();
        
        // Extract unique query IDs from messages
        for (const msg of allMessages) {
          if (msg.session_id === sessionId && msg.query_id) {
            queries.add(msg.query_id);
          }
        }
        
        sessionStats[sessionId] = {
          message_count: messages.length,
          query_count: queries.size
        };
      }
      
      res.json({
        total_sessions: sessions.length,
        total_messages: allMessages.length,
        sessions: sessionStats
      });
    } catch (error) {
      console.error('Failed to get memory status:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });


  // List sessions - GET /sessions
  router.get('/sessions', (req, res) => {
    try {
      // Get all unique session IDs from the memory store
      const sessions = memory.getAllSessions();
      res.json({ sessions });
    } catch (error) {
      console.error('Failed to get sessions:', error);
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
   * /sessions/{sessionId}:
   *   delete:
   *     summary: Delete a specific session
   *     description: Removes all messages for a specific session
   *     tags:
   *       - Memory
   *     parameters:
   *       - in: path
   *         name: sessionId
   *         required: true
   *         schema:
   *           type: string
   *         description: Session ID to delete
   *     responses:
   *       200:
   *         description: Session deleted successfully
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
   *                   example: Session deleted
   *       400:
   *         description: Invalid session ID
   *       500:
   *         description: Failed to delete session
   */
  router.delete('/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }
    
    memory.clearSession(sessionId);
    res.json({ status: 'success', message: `Session ${sessionId} deleted` });
  });

  /**
   * @swagger
   * /sessions/{sessionId}/queries/{queryId}/messages:
   *   delete:
   *     summary: Delete messages for a specific query
   *     description: Removes all messages for a specific query within a session
   *     tags:
   *       - Memory
   *     parameters:
   *       - in: path
   *         name: sessionId
   *         required: true
   *         schema:
   *           type: string
   *         description: Session ID
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
  router.delete('/sessions/:sessionId/queries/:queryId/messages', (req, res) => {
    const { sessionId, queryId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }
    
    if (!queryId) {
      res.status(400).json({ error: 'Query ID is required' });
      return;
    }
    
    memory.clearQuery(sessionId, queryId);
    res.json({ status: 'success', message: `Query ${queryId} messages deleted from session ${sessionId}` });
  });

  /**
   * @swagger
   * /sessions:
   *   delete:
   *     summary: Delete all sessions
   *     description: Removes all sessions and their messages (same as purging memory)
   *     tags:
   *       - Memory
   *     responses:
   *       200:
   *         description: All sessions deleted successfully
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
   *                   example: All sessions deleted
   *       500:
   *         description: Failed to delete sessions
   */
  router.delete('/sessions', (req, res) => {
    memory.purge();
    res.json({ status: 'success', message: 'All sessions deleted' });
  });

  return router;
}
