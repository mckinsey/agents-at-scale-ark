import {Router} from 'express';
import {z} from 'zod';
import {CompletionChunkBroker} from '../completion-chunk-broker.js';
import {StreamError} from '../types.js';
import {streamSSE, writeSSEEvent} from '../sse.js';
import {parsePaginationParams, PaginationError} from '../pagination.js';

interface ChunkPayload {
  error?: StreamError;
  choices?: Array<{
    delta?: {content?: string; tool_calls?: unknown[]};
    finish_reason?: string;
  }>;
}

const getStreamQuerySchema = z.object({
  'from-beginning': z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  'wait-for-query': z.coerce.number().int().nonnegative().optional(),
  'max-chunk-size': z.coerce.number().int().positive().optional(),
});
type GetStreamQuery = z.infer<typeof getStreamQuerySchema>;
type GetStreamQueryRaw = {
  'from-beginning'?: 'true' | 'false';
  'wait-for-query'?: string;
  'max-chunk-size'?: string;
};

export function createStreamRouter(chunks: CompletionChunkBroker): Router {
  const router = Router();

  /**
   * @swagger
   * /stream:
   *   get:
   *     summary: Get paginated chunks or stream via SSE
   *     description: Returns paginated list of chunks or streams them via SSE with watch=true
   *     tags:
   *       - Streaming
   *     parameters:
   *       - in: query
   *         name: watch
   *         schema:
   *           type: boolean
   *         description: Stream chunks via SSE
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Maximum items to return
   *       - in: query
   *         name: cursor
   *         schema:
   *           type: integer
   *         description: Cursor for pagination
   *     responses:
   *       200:
   *         description: Paginated chunks or SSE stream
   */
  router.get('/', (req, res) => {
    const watch = req.query['watch'] === 'true';

    if (watch) {
      req.log.info('starting SSE stream for all chunks');
      streamSSE({
        res,
        req,
        logger: req.log,
        tag: 'STREAM',
        itemName: 'chunks',
        subscribe: (callback) =>
          chunks.subscribe((item) => callback(item.data.chunk)),
      });
    } else {
      try {
        const params = parsePaginationParams(
          req.query as Record<string, unknown>
        );
        const result = chunks.paginate(params);
        res.json(result);
      } catch (error) {
        if (error instanceof PaginationError) {
          res.status(400).json({error: error.message});
          return;
        }
        req.log.error({err: error}, 'failed to get chunks');
        const err = error as Error;
        res.status(500).json({error: err.message});
      }
    }
  });

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
   *           type: integer
   *         description: Wait timeout in seconds for query to start (e.g., 30, 300)
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
  router.get<{query_name: string}, unknown, unknown, GetStreamQueryRaw>(
    '/:query_name',
    async (req, res) => {
      const parse = getStreamQuerySchema.safeParse(req.query);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parse.error.issues
              .map((e) => `${e.path.join('.') || 'query'}: ${e.message}`)
              .join('; '),
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }
      const streamQuery: GetStreamQuery = parse.data;

      try {
        const {query_name} = req.params;
        const fromBeginning = streamQuery['from-beginning'] ?? false;
        const waitForQuerySeconds = streamQuery['wait-for-query'];
        const waitForQuery = waitForQuerySeconds !== undefined;
        const timeout =
          waitForQuerySeconds !== undefined
            ? Math.max(1000, Math.min(waitForQuerySeconds * 1000, 300000))
            : 30000;
        const maxChunkSize = streamQuery['max-chunk-size'] ?? 50;

        req.log.info(
          {
            queryName: query_name,
            fromBeginning,
            waitForQuery,
            timeout,
            maxChunkSize,
          },
          'starting query stream'
        );

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        let hasReceivedChunks = false;

        let outboundChunkCount = 0;
        let lastLogTime = Date.now();
        const chunkTypeCounts: Record<string, number> = {
          content: 0,
          tool_calls: 0,
          finish_reason: 0,
          other: 0,
        };

        const unsubscribeChunks = chunks.subscribeToQuery(
          query_name,
          (item) => {
            const chunk = item.data.chunk as ChunkPayload | string;
            hasReceivedChunks = true;

            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
              timeoutHandle = undefined;
            }

            if (typeof chunk === 'string') {
              return;
            }

            if (chunk.error) {
              const streamError = chunk.error;
              if (
                typeof streamError.message !== 'string' ||
                typeof streamError.type !== 'string'
              ) {
                req.log.error(
                  {queryName: query_name, chunk},
                  'invalid error chunk structure'
                );
                res.status(500).json({error: 'Invalid error chunk structure'});
                unsubscribeChunks();
                unsubscribeComplete();
                return;
              }

              if (!writeSSEEvent(res, chunk)) {
                req.log.info(
                  {queryName: query_name},
                  'failed to write error chunk, client may have disconnected'
                );
                unsubscribeChunks();
                unsubscribeComplete();
                return;
              }
              res.write('data: [DONE]\n\n');
              res.end();
              unsubscribeChunks();
              unsubscribeComplete();
              return;
            }

            if (!writeSSEEvent(res, chunk)) {
              req.log.info(
                {queryName: query_name},
                'client disconnected (write failed)'
              );
              unsubscribeChunks();
              unsubscribeComplete();
              return;
            }

            outboundChunkCount++;

            if (chunk.choices?.[0]?.delta?.content) {
              chunkTypeCounts.content++;
            } else if (
              (chunk.choices?.[0]?.delta?.tool_calls?.length ?? 0) > 0
            ) {
              chunkTypeCounts.tool_calls++;
            } else if (chunk.choices?.[0]?.finish_reason) {
              chunkTypeCounts.finish_reason++;
            } else {
              chunkTypeCounts.other++;
            }

            const now = Date.now();
            if (now - lastLogTime >= 1000) {
              req.log.debug(
                {
                  queryName: query_name,
                  total: outboundChunkCount,
                  types: chunkTypeCounts,
                },
                'sent chunks'
              );
              lastLogTime = now;
            }
          }
        );

        const completeHandler = (): void => {
          req.log.info(
            {
              queryName: query_name,
              total: outboundChunkCount,
              types: chunkTypeCounts,
            },
            'query complete, sending [DONE] and closing stream'
          );
          res.write('data: [DONE]\n\n');
          res.end();
          unsubscribeChunks();
          chunks.eventEmitter.off(`complete:${query_name}`, completeHandler);
        };
        const unsubscribeComplete = (): void => {
          chunks.eventEmitter.off(`complete:${query_name}`, completeHandler);
        };
        chunks.eventEmitter.on(`complete:${query_name}`, completeHandler);

        if (waitForQuery) {
          timeoutHandle = setTimeout(() => {
            if (!hasReceivedChunks) {
              req.log.error(
                {queryName: query_name, timeout},
                'timeout waiting for chunks'
              );
              const errorEvent = {
                error: {
                  message:
                    'Request timeout waiting for streaming query response',
                  type: 'timeout_error',
                  code: 'timeout',
                },
              };
              res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
              unsubscribeChunks();
              unsubscribeComplete();
            }
          }, timeout);
        }

        if (fromBeginning) {
          const existingChunks = chunks.getChunksByQuery(query_name);
          req.log.info(
            {queryName: query_name, count: existingChunks.length},
            'sending existing chunks for replay'
          );

          for (let i = 0; i < existingChunks.length; i++) {
            const chunk = existingChunks[i];

            if (chunk === '[DONE]') {
              req.log.info(
                {queryName: query_name},
                'found [DONE] during replay, closing stream'
              );
              res.write('data: [DONE]\n\n');
              res.end();
              unsubscribeChunks();
              unsubscribeComplete();
              return;
            }

            if (!writeSSEEvent(res, chunk)) {
              req.log.warn(
                {queryName: query_name},
                'error writing existing chunk'
              );
              unsubscribeChunks();
              unsubscribeComplete();
              return;
            }
          }
        }

        req.on('close', () => {
          req.log.info({queryName: query_name}, 'client disconnected');
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          unsubscribeChunks();
          unsubscribeComplete();
        });

        req.on('error', (error: Error & {code?: string}) => {
          if (error.code === 'ECONNRESET') {
            req.log.info({queryName: query_name}, 'client connection reset');
          } else {
            req.log.error(
              {err: error, queryName: query_name},
              'client connection error'
            );
          }
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          unsubscribeChunks();
          unsubscribeComplete();
        });
      } catch (error) {
        req.log.error({err: error}, 'failed to handle stream request');
        const err = error as Error;
        res.status(500).json({error: err.message});
      }
    }
  );

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
  router.post<{query_id: string}>('/:query_id', (req, res) => {
    try {
      const {query_id} = req.params;

      if (!query_id) {
        res.status(400).json({error: 'Query ID parameter is required'});
        return;
      }

      req.log.info({queryId: query_id}, 'receiving chunks from ARK controller');

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Connection', 'keep-alive');

      let chunkCount = 0;
      let buffer = '';
      let lastLogTime = Date.now();
      const chunkTypeCounts: Record<string, number> = {
        content: 0,
        tool_calls: 0,
        finish_reason: 0,
        other: 0,
      };

      req.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');

        while (buffer.includes('\n')) {
          const newlineIndex = buffer.indexOf('\n');
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line) {
            try {
              const streamChunk = JSON.parse(line);
              chunkCount++;

              if (streamChunk?.choices?.[0]?.delta?.content) {
                chunkTypeCounts.content++;
              } else if (
                streamChunk?.choices?.[0]?.delta?.tool_calls?.length > 0
              ) {
                chunkTypeCounts.tool_calls++;
              } else if (streamChunk?.choices?.[0]?.finish_reason) {
                chunkTypeCounts.finish_reason++;
              } else {
                chunkTypeCounts.other++;
              }

              if (chunkCount === 1) {
                req.log.info({queryId: query_id}, 'receiving chunks...');
              }

              const now = Date.now();
              if (now - lastLogTime >= 1000) {
                req.log.debug(
                  {
                    queryId: query_id,
                    total: chunkCount,
                    types: chunkTypeCounts,
                  },
                  'received chunks'
                );
                lastLogTime = now;
              }

              chunks.addChunk(query_id, streamChunk);
            } catch (parseError) {
              req.log.error(
                {err: parseError, queryId: query_id},
                'failed to parse chunk'
              );
            }
          }
        }
      });

      req.on('end', () => {
        req.log.info(
          {queryId: query_id, total: chunkCount, types: chunkTypeCounts},
          'stream ended'
        );
        res.json({
          status: 'stream_processed',
          query: query_id,
          chunks_received: chunkCount,
        });
      });

      req.on('error', (error: Error & {code?: string}) => {
        if (error.code === 'ECONNRESET') {
          req.log.error(
            {queryId: query_id},
            'ARK controller disconnected unexpectedly (ECONNRESET)'
          );
        } else {
          req.log.error(
            {err: error, queryId: query_id},
            'stream error from ARK controller'
          );
        }
        res.status(500).json({error: 'Stream processing failed'});
      });
    } catch (error) {
      req.log.error({err: error}, 'failed to handle stream POST request');
      const err = error as Error;
      res.status(500).json({error: err.message});
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
  router.post<{query_id: string}>('/:query_id/complete', (req, res) => {
    try {
      const {query_id} = req.params;

      if (!query_id) {
        res.status(400).json({error: 'Query ID parameter is required'});
        return;
      }

      req.log.info({queryId: query_id}, 'marking query as complete');

      if (!chunks.hasQuery(query_id)) {
        res.status(404).json({error: 'Stream not found'});
        return;
      }

      if (chunks.isComplete(query_id)) {
        res.json({
          status: 'already_completed',
          query: query_id,
        });
        return;
      }

      chunks.completeQuery(query_id);

      res.json({
        status: 'completed',
        query: query_id,
      });
    } catch (error) {
      req.log.error({err: error}, 'failed to complete query stream');
      const err = error as Error;
      res.status(500).json({error: err.message});
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
      chunks.delete();
      res.json({status: 'success', message: 'Stream data purged'});
    } catch (error) {
      req.log.error({err: error}, 'stream purge failed');
      res.status(500).json({error: 'Failed to purge stream data'});
    }
  });

  return router;
}
