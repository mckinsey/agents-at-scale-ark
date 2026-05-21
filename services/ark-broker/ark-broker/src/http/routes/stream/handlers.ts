import type {Request, Response} from 'express';
import {CompletionChunkBroker} from '@ark-broker/brokers/chunks-broker.js';
import {writeSSEEvent} from '@ark-broker/http/sse.js';
import {sendInternalError} from '@ark-broker/http/routes/errors.js';
import {StreamError} from './schemas.js';

interface ChunkPayload {
  error?: StreamError;
  choices?: Array<{
    delta?: {content?: string; tool_calls?: unknown[]};
    finish_reason?: string;
  }>;
}

function classifyChunk(
  chunk: ChunkPayload,
  counts: Record<string, number>
): void {
  if (chunk.choices?.[0]?.delta?.content) {
    counts.content++;
  } else if ((chunk.choices?.[0]?.delta?.tool_calls?.length ?? 0) > 0) {
    counts.tool_calls++;
  } else if (chunk.choices?.[0]?.finish_reason) {
    counts.finish_reason++;
  } else {
    counts.other++;
  }
}

export function handleQueryStream(
  req: Request,
  res: Response,
  chunks: CompletionChunkBroker,
  queryName: string,
  fromBeginning: boolean,
  waitForQuerySeconds: number | undefined,
  maxChunkSize: number
): void {
  const waitForQuery = waitForQuerySeconds !== undefined;
  const timeout =
    waitForQuerySeconds === undefined
      ? 30000
      : Math.max(1000, Math.min(waitForQuerySeconds * 1000, 300000));

  req.log.info(
    {queryName, fromBeginning, waitForQuery, timeout, maxChunkSize},
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

  const unsubscribeChunks = chunks.subscribeToQuery(queryName, (item) => {
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
        req.log.error({queryName, chunk}, 'invalid error chunk structure');
        sendInternalError(res, req.id);
        unsubscribeChunks();
        unsubscribeComplete();
        return;
      }

      if (!writeSSEEvent(res, chunk, req.log)) {
        req.log.info(
          {queryName},
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

    if (!writeSSEEvent(res, chunk, req.log)) {
      req.log.info({queryName}, 'client disconnected (write failed)');
      unsubscribeChunks();
      unsubscribeComplete();
      return;
    }

    outboundChunkCount++;
    classifyChunk(chunk, chunkTypeCounts);

    const now = Date.now();
    if (now - lastLogTime >= 1000) {
      req.log.debug(
        {queryName, total: outboundChunkCount, types: chunkTypeCounts},
        'sent chunks'
      );
      lastLogTime = now;
    }
  });

  const completeHandler = (): void => {
    req.log.info(
      {queryName, total: outboundChunkCount, types: chunkTypeCounts},
      'query complete, sending [DONE] and closing stream'
    );
    res.write('data: [DONE]\n\n');
    res.end();
    unsubscribeChunks();
    chunks.eventEmitter.off(`complete:${queryName}`, completeHandler);
  };
  const unsubscribeComplete = (): void => {
    chunks.eventEmitter.off(`complete:${queryName}`, completeHandler);
  };
  chunks.eventEmitter.on(`complete:${queryName}`, completeHandler);

  if (waitForQuery) {
    timeoutHandle = setTimeout(() => {
      if (!hasReceivedChunks) {
        req.log.error({queryName, timeout}, 'timeout waiting for chunks');
        const errorEvent = {
          error: {
            message: 'Request timeout waiting for streaming query response',
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
    const existingChunks = chunks.getChunksByQuery(queryName);
    req.log.info(
      {queryName, count: existingChunks.length},
      'sending existing chunks for replay'
    );

    for (const chunk of existingChunks) {
      if (chunk === '[DONE]') {
        req.log.info({queryName}, 'found [DONE] during replay, closing stream');
        res.write('data: [DONE]\n\n');
        res.end();
        unsubscribeChunks();
        unsubscribeComplete();
        return;
      }

      if (!writeSSEEvent(res, chunk, req.log)) {
        req.log.warn({queryName}, 'error writing existing chunk');
        unsubscribeChunks();
        unsubscribeComplete();
        return;
      }
    }
  }

  req.on('close', () => {
    req.log.info({queryName}, 'client disconnected');
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    unsubscribeChunks();
    unsubscribeComplete();
  });

  req.on('error', (error: Error & {code?: string}) => {
    if (error.code === 'ECONNRESET') {
      req.log.info({queryName}, 'client connection reset');
    } else {
      req.log.error({err: error, queryName}, 'client connection error');
    }
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    unsubscribeChunks();
    unsubscribeComplete();
  });
}

export function processNDJSONData(
  rawChunk: Buffer,
  state: {
    buffer: string;
    chunkCount: number;
    lastLogTime: number;
    chunkTypeCounts: Record<string, number>;
  },
  queryId: string,
  chunks: CompletionChunkBroker,
  log: Request['log']
): void {
  state.buffer += rawChunk.toString('utf-8');

  while (state.buffer.includes('\n')) {
    const newlineIndex = state.buffer.indexOf('\n');
    const line = state.buffer.slice(0, newlineIndex).trim();
    state.buffer = state.buffer.slice(newlineIndex + 1);

    if (line) {
      try {
        const streamChunk = JSON.parse(line);
        state.chunkCount++;
        classifyChunk(streamChunk as ChunkPayload, state.chunkTypeCounts);

        if (state.chunkCount === 1) {
          log.info({queryId}, 'receiving chunks...');
        }

        const now = Date.now();
        if (now - state.lastLogTime >= 1000) {
          log.debug(
            {queryId, total: state.chunkCount, types: state.chunkTypeCounts},
            'received chunks'
          );
          state.lastLogTime = now;
        }

        chunks.addChunk(queryId, streamChunk);
      } catch (parseError) {
        log.error({err: parseError, queryId}, 'failed to parse chunk');
      }
    }
  }
}
