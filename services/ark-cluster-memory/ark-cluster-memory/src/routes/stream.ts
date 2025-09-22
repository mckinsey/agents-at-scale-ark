import { Router, Response } from 'express';
import { StreamStore } from '../stream-store.js';
import { StreamResponse } from '../types.js';

// Helper function to parse timeout parameter
const parseTimeout = (timeoutStr: string | undefined, defaultTimeout: number): number => {
  if (!timeoutStr) return defaultTimeout;
  const timeout = parseInt(timeoutStr);
  return isNaN(timeout) ? defaultTimeout : Math.max(1000, Math.min(timeout * 1000, 300000));
};



// Helper function to write SSE event
const writeSSEEvent = (res: Response, data: StreamResponse): boolean => {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    console.error('Error writing SSE event:', error);
    return false;
  }
};

export function createStreamRouter(stream: StreamStore): Router {
  const router = Router();

  /**
   * @swagger
   * /stream:
   *   get:
   *     summary: Get stream statistics
   *     description: Returns statistics about all stored streams including chunk counts and completion status
   *     tags:
   *       - Streaming
   *     responses:
   *       200:
   *         description: Stream statistics retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 total_queries:
   *                   type: integer
   *                   description: Total number of queries with streams
   *                 queries:
   *                   type: object
   *                   description: Per-query statistics
   *                   additionalProperties:
   *                     type: object
   *                     properties:
   *                       total_chunks:
   *                         type: integer
   *                       completed:
   *                         type: boolean
   *                       has_done_marker:
   *                         type: boolean
   *                       chunk_types:
   *                         type: object
   */
  // Removed GET /stream to avoid conflicts - statistics now at /stream-statistics

  /**
   * @swagger
   * /stream/{query_name}:
   *   get:
   *     summary: Stream query chunks via Server-Sent Events
   *     description: Provides real-time streaming of OpenAI-format chunks for a specific query
   *     tags:
   *       - Streaming
   *     parameters:
   *       - in: path
   *         name: query_name
   *         required: true
   *         schema:
   *           type: string
   *         description: Query name/ID to stream
   *       - in: query
   *         name: from-beginning
   *         schema:
   *           type: boolean
   *           default: false
   *         description: Replay all chunks from the beginning
   *       - in: query
   *         name: wait-for-query
   *         schema:
   *           type: string
   *         description: Wait timeout for query to start (e.g., "30s", "5m")
   *       - in: query
   *         name: max-chunk-size
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum characters per chunk (for testing)
   *     responses:
   *       200:
   *         description: SSE stream of OpenAI chunks
   *         content:
   *           text/event-stream:
   *             schema:
   *               type: string
   *               example: 'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}'
   */
  router.get('/:query_name', async (req, res) => {
    try {
      const { query_name } = req.params;
      const fromBeginning = req.query['from-beginning'] === 'true';
      // Parse wait-for-query parameter - timeout value (e.g., "30s")
      const waitForQueryParam = req.query['wait-for-query'] as string;
      let waitForQuery = false;
      let timeout = 30000; // default 30 seconds
      
      if (waitForQueryParam) {
        waitForQuery = true;
        timeout = parseTimeout(waitForQueryParam, 30000);
      }
      
      // Parse max chunk size, default to 50 characters
      let maxChunkSize = 50;
      if (req.query['max-chunk-size']) {
        const size = parseInt(req.query['max-chunk-size'] as string);
        if (!isNaN(size) && size > 0) {
          maxChunkSize = size;
        }
      }

      console.log(`[STREAM] GET /stream/${query_name} - from-beginning=${fromBeginning}, wait-for-query=${waitForQueryParam}, timeout=${timeout}ms, max-chunk-size=${maxChunkSize}`);

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Set up timeout if wait-for-query is specified
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let hasReceivedChunks = false;

      // Subscribe to streaming chunks for this query
      let outboundChunkCount = 0;
      let lastLogTime = Date.now();
      const chunkTypeCounts: Record<string, number> = {
        content: 0,
        tool_calls: 0,
        finish_reason: 0,
        other: 0
      };
      
      const unsubscribeChunks = stream.subscribeToChunks(query_name, (chunk: any) => {
        hasReceivedChunks = true;
        
        // Clear timeout on first chunk
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
        // Chunks are already in OpenAI format, just forward them (including finish_reason chunks)
        if (!writeSSEEvent(res, chunk)) {
          console.log(`[STREAM-OUT] Query ${query_name}: Client disconnected (write failed)`);
          unsubscribeChunks();
          unsubscribeComplete();
          return;
        }
        
        outboundChunkCount++;
        
        // Count chunk type
        if (chunk?.choices?.[0]?.delta?.content) {
          chunkTypeCounts.content++;
        } else if (chunk?.choices?.[0]?.delta?.tool_calls?.length > 0) {
          chunkTypeCounts.tool_calls++;
        } else if (chunk?.choices?.[0]?.finish_reason) {
          chunkTypeCounts.finish_reason++;
        } else {
          chunkTypeCounts.other++;
        }
        
        // Log every second instead of every 10 chunks
        const now = Date.now();
        if (now - lastLogTime >= 1000) {
          const typeStr = Object.entries(chunkTypeCounts)
            .filter(([_, count]) => count > 0)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ');
          console.log(`[STREAM-OUT] Query ${query_name}: Sent ${outboundChunkCount} chunks (${typeStr})`);
          lastLogTime = now;
        }
      });
      
      // Subscribe to completion event - this signals the entire query is done
      const completeHandler = (): void => {
        const typeStr = Object.entries(chunkTypeCounts)
          .filter(([_, count]) => count > 0)
          .map(([type, count]) => `${count} ${type}`)
          .join(', ');
        console.log(`[STREAM-OUT] Query ${query_name}: Query complete, sending [DONE] and closing stream (total: ${outboundChunkCount} chunks - ${typeStr})`);
        res.write('data: [DONE]\n\n');
        res.end();
        unsubscribeChunks();
        stream.eventEmitter.off(`complete:${query_name}`, completeHandler);
      };
      const unsubscribeComplete = (): void => { stream.eventEmitter.off(`complete:${query_name}`, completeHandler); };
      stream.eventEmitter.on(`complete:${query_name}`, completeHandler);
      
      // Set up timeout if wait-for-query is specified
      if (waitForQuery) {
        timeoutHandle = setTimeout(() => {
          if (!hasReceivedChunks) {
            console.log(`[STREAM] Query ${query_name}: Timeout after ${timeout}ms waiting for chunks (no chunks received)`);
            res.end();
            unsubscribeChunks();
            unsubscribeComplete();
          }
        }, timeout);
      }

      // If from-beginning, send existing chunks first  
      if (fromBeginning) {
        const existingChunks = stream.getStreamChunks(query_name);
        console.log(`[STREAM] Sending ${existingChunks.length} existing chunks for query ${query_name}`);
        
        for (let i = 0; i < existingChunks.length; i++) {
          const chunk = existingChunks[i];
          
          // Check for [DONE] marker - if found, send it properly and close
          if (chunk === '[DONE]') {
            console.log(`[STREAM-OUT] Query ${query_name}: Found [DONE] marker during replay, closing stream`);
            res.write('data: [DONE]\n\n');
            res.end();
            unsubscribeChunks();
            unsubscribeComplete();
            return;
          }
          
          // Chunks are already in OpenAI format, just forward them
          if (!writeSSEEvent(res, chunk)) {
            console.log(`[STREAM] Error writing existing chunk for query ${query_name}`);
            unsubscribeChunks();
            unsubscribeComplete();
            return;
          }
        }
      }

      // Handle client disconnect
      req.on('close', () => {
        console.log(`[STREAM-OUT] Query ${query_name}: Client disconnected`);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        unsubscribeChunks();
        unsubscribeComplete();
      });

      req.on('error', (error: any) => {
        if (error.code === 'ECONNRESET') {
          console.log(`[STREAM-OUT] Query ${query_name}: Client connection reset`);
        } else {
          console.error(`[STREAM-OUT] Query ${query_name}: Client connection error:`, error);
        }
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        unsubscribeChunks();
        unsubscribeComplete();
      });

    } catch (error) {
      console.error('[STREAM] Failed to handle stream request:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * @swagger
   * /stream/{query_id}:
   *   post:
   *     summary: Receive streaming chunks from ARK controller
   *     description: Endpoint for ARK to send newline-delimited JSON chunks for streaming
   *     tags:
   *       - Streaming
   *     parameters:
   *       - in: path
   *         name: query_id
   *         required: true
   *         schema:
   *           type: string
   *         description: Query ID receiving chunks
   *     requestBody:
   *       description: Newline-delimited JSON stream
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: string
   *             description: Newline-delimited JSON chunks
   *     responses:
   *       200:
   *         description: Stream processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: stream_processed
   *                 query:
   *                   type: string
   *                 chunks_received:
   *                   type: number
   *       400:
   *         description: Invalid request
   */
  router.post('/:query_id', (req, res) => {
    try {
      const { query_id } = req.params;
      
      if (!query_id) {
        res.status(400).json({ error: 'Query ID parameter is required' });
        return;
      }
      
      console.log(`[STREAM] POST /stream/${query_id} - receiving chunks from ARK controller`);
      
      // Set headers for newline-delimited JSON streaming
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Connection', 'keep-alive');
      
      let chunkCount = 0;
      let buffer = '';
      let lastLogTime = Date.now();
      const chunkTypeCounts: Record<string, number> = {
        content: 0,
        tool_calls: 0,
        finish_reason: 0,
        other: 0
      };
      
      // Handle incoming streaming chunks
      req.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        
        // Process complete lines (newline-delimited JSON)
        while (buffer.includes('\n')) {
          const newlineIndex = buffer.indexOf('\n');
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          
          if (line) {
            try {
              const streamChunk = JSON.parse(line);
              chunkCount++;
              
              // Count chunk type
              if (streamChunk?.choices?.[0]?.delta?.content) {
                chunkTypeCounts.content++;
              } else if (streamChunk?.choices?.[0]?.delta?.tool_calls?.length > 0) {
                chunkTypeCounts.tool_calls++;
              } else if (streamChunk?.choices?.[0]?.finish_reason) {
                chunkTypeCounts.finish_reason++;
              } else {
                chunkTypeCounts.other++;
              }
              
              // Log first chunk immediately
              if (chunkCount === 1) {
                console.log(`[STREAM-IN] Query ${query_id}: Receiving chunks...`);
              }
              
              // Log every second instead of every 10 chunks
              const now = Date.now();
              if (now - lastLogTime >= 1000) {
                const typeStr = Object.entries(chunkTypeCounts)
                  .filter(([_, count]) => count > 0)
                  .map(([type, count]) => `${count} ${type}`)
                  .join(', ');
                console.log(`[STREAM-IN] Query ${query_id}: Received ${chunkCount} chunks (${typeStr})`);
                lastLogTime = now;
              }
              
              // Store the chunk for later replay AND forward to active streaming clients
              stream.addStreamChunk(query_id, streamChunk);
              stream.eventEmitter.emit(`chunk:${query_id}`, streamChunk);
            } catch (parseError) {
              console.error(`[STREAM-IN] Failed to parse chunk for query ${query_id}:`, parseError);
            }
          }
        }
      });
      
      req.on('end', () => {
        const typeStr = Object.entries(chunkTypeCounts)
          .filter(([_, count]) => count > 0)
          .map(([type, count]) => `${count} ${type}`)
          .join(', ');
        console.log(`[STREAM-IN] Query ${query_id}: Stream ended (total: ${chunkCount} chunks - ${typeStr})`);
        res.json({
          status: 'stream_processed',
          query: query_id,
          chunks_received: chunkCount
        });
      });
      
      req.on('error', (error: any) => {
        if (error.code === 'ECONNRESET') {
          console.error(`[STREAM-IN] Query ${query_id}: ARK controller disconnected unexpectedly (ECONNRESET) - likely timeout or network issue`);
        } else {
          console.error(`[STREAM-IN] Query ${query_id}: Stream error from ARK controller:`, error);
        }
        res.status(500).json({ error: 'Stream processing failed' });
      });
      
    } catch (error) {
      console.error('[STREAM] Failed to handle stream POST request:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * @swagger
   * /stream/{query_id}/complete:
   *   post:
   *     summary: Mark query stream as complete
   *     description: Notifies the memory service that a query's streaming is complete
   *     tags:
   *       - Streaming
   *     parameters:
   *       - in: path
   *         name: query_id
   *         required: true
   *         schema:
   *           type: string
   *         description: Query ID to mark as complete
   *     responses:
   *       200:
   *         description: Stream marked as complete
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: completed
   *                 query:
   *                   type: string
   *       400:
   *         description: Invalid request
   */
  router.post('/:query_id/complete', (req, res) => {
    try {
      const { query_id } = req.params;
      
      if (!query_id) {
        res.status(400).json({ error: 'Query ID parameter is required' });
        return;
      }
      
      console.log(`[STREAM] POST /stream/${query_id}/complete - marking query as complete`);

      // Check if stream exists
      if (!stream.hasStream(query_id)) {
        res.status(404).json({ error: 'Stream not found' });
        return;
      }

      // Check if already completed (for idempotency)
      if (stream.isStreamComplete(query_id)) {
        res.json({
          status: 'already_completed',
          query: query_id
        });
        return;
      }

      // Mark query stream as complete
      stream.completeQueryStream(query_id);

      res.json({
        status: 'completed',
        query: query_id
      });
    } catch (error) {
      console.error('[STREAM] Failed to complete query stream:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * @swagger
   * /stream:
   *   delete:
   *     summary: Purge all stream data
   *     description: Clears all stored streaming chunks and completion states
   *     tags:
   *       - Streaming
   *     responses:
   *       200:
   *         description: Streams purged successfully
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
   *                   example: Stream data purged
   *       500:
   *         description: Failed to purge streams
   */
  router.delete('/', (req, res) => {
    try {
      stream.purge();
      res.json({ status: 'success', message: 'Stream data purged' });
    } catch (error) {
      console.error('Stream purge failed:', error);
      res.status(500).json({ error: 'Failed to purge stream data' });
    }
  });

  return router;
}