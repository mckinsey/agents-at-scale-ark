import {Router} from 'express';
import {CompletionChunkBroker} from '@ark-broker/brokers/chunks-broker.js';
import {streamSSE} from '@ark-broker/http/sse.js';
import {
  parsePaginationParams,
  PaginationError,
} from '@ark-broker/brokers/pagination.js';
import {
  sendValidationError,
  sendPaginationError,
  sendInternalError,
} from '@ark-broker/http/routes/errors.js';
import {
  getStreamQuerySchema,
  GetStreamQuery,
  GetStreamQueryRaw,
} from './schemas.js';
import {handleQueryStream, processNDJSONData} from './handlers.js';

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
  router.get('/', async (req, res) => {
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
        const result = await chunks.paginate(params);
        res.json(result);
      } catch (error) {
        if (error instanceof PaginationError) {
          sendPaginationError(res, error, req.id);
          return;
        }
        req.log.error({err: error}, 'failed to get chunks');
        sendInternalError(res, req.id);
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
        sendValidationError(res, parse.error, req.id, 'query');
        return;
      }
      const streamQuery: GetStreamQuery = parse.data;
      const {query_name} = req.params;
      try {
        await handleQueryStream(
          req,
          res,
          chunks,
          query_name,
          streamQuery['from-beginning'] ?? false,
          streamQuery['wait-for-query'],
          streamQuery['max-chunk-size'] ?? 50
        );
      } catch (error) {
        req.log.error({err: error}, 'failed to handle stream request');
        sendInternalError(res, req.id);
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
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Query ID parameter is required',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }

      req.log.info({queryId: query_id}, 'receiving chunks from ARK controller');

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Connection', 'keep-alive');

      const state = {
        buffer: '',
        chunkCount: 0,
        lastLogTime: Date.now(),
        chunkTypeCounts: {
          content: 0,
          tool_calls: 0,
          finish_reason: 0,
          other: 0,
        },
        appendChain: Promise.resolve(),
      };

      req.on('data', (chunk: Buffer) =>
        processNDJSONData(chunk, state, query_id, chunks, req.log)
      );

      req.on('end', () => {
        void state.appendChain
          .then(() => {
            req.log.info(
              {
                queryId: query_id,
                total: state.chunkCount,
                types: state.chunkTypeCounts,
              },
              'stream ended'
            );
            res.json({
              status: 'stream_processed',
              query: query_id,
              chunks_received: state.chunkCount,
            });
          })
          .catch((err: unknown) => {
            req.log.error({err, queryId: query_id}, 'append error');
            sendInternalError(res, req.id);
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
        sendInternalError(res, req.id);
      });
    } catch (error) {
      req.log.error({err: error}, 'failed to handle stream POST request');
      sendInternalError(res, req.id);
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
  router.post<{query_id: string}>('/:query_id/complete', async (req, res) => {
    try {
      const {query_id} = req.params;

      if (!query_id) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Query ID parameter is required',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }

      req.log.info({queryId: query_id}, 'marking query as complete');

      if (!(await chunks.hasQuery(query_id))) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Stream not found',
            requestId: req.id === undefined ? undefined : String(req.id),
          },
        });
        return;
      }

      if (await chunks.isComplete(query_id)) {
        res.json({
          status: 'already_completed',
          query: query_id,
        });
        return;
      }

      await chunks.completeQuery(query_id);

      res.json({
        status: 'completed',
        query: query_id,
      });
    } catch (error) {
      req.log.error({err: error}, 'failed to complete query stream');
      sendInternalError(res, req.id);
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
  router.delete('/', async (req, res) => {
    try {
      await chunks.delete();
      res.json({status: 'success', message: 'Stream data purged'});
    } catch (error) {
      req.log.error({err: error}, 'stream purge failed');
      sendInternalError(res, req.id);
    }
  });

  return router;
}
