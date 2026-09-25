import type {Request, Response} from 'express';
import type {CompletionChunkBroker} from '@ark-broker/brokers/chunks-broker.js';
import type {CompletionChunkData} from '@ark-broker/brokers/stream/chunk-stream.js';
import {BrokerItem} from '@ark-broker/brokers/stream/broker-item.js';
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

interface StreamCounters {
  outboundChunkCount: number;
  lastLogTime: number;
  chunkTypeCounts: Record<string, number>;
}

interface QueryStreamState {
  caughtUp: boolean;
  timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  rearmIdleTimeout: () => void;
  buffer: BrokerItem<CompletionChunkData>[];
  counters: StreamCounters;
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

function writeLiveChunk(
  res: Response,
  req: Request,
  item: BrokerItem<CompletionChunkData>,
  queryName: string,
  counters: StreamCounters,
  cleanup: () => void
): void {
  const chunk = item.data.chunk as ChunkPayload | string;
  if (typeof chunk === 'string') return;

  if (chunk.error) {
    const streamError = chunk.error;
    if (
      typeof streamError.message !== 'string' ||
      typeof streamError.type !== 'string'
    ) {
      req.log.error({queryName, chunk}, 'invalid error chunk structure');
      sendInternalError(res, req.id);
      cleanup();
      return;
    }
    if (!writeSSEEvent(res, chunk, req.log)) {
      req.log.info(
        {queryName},
        'failed to write error chunk, client may have disconnected'
      );
      cleanup();
      return;
    }
    res.write('data: [DONE]\n\n');
    res.end();
    cleanup();
    return;
  }

  if (!writeSSEEvent(res, chunk, req.log)) {
    req.log.info({queryName}, 'client disconnected (write failed)');
    cleanup();
    return;
  }

  counters.outboundChunkCount++;
  classifyChunk(chunk, counters.chunkTypeCounts);
  const now = Date.now();
  if (now - counters.lastLogTime >= 1000) {
    req.log.debug(
      {
        queryName,
        total: counters.outboundChunkCount,
        types: counters.chunkTypeCounts,
      },
      'sent chunks'
    );
    counters.lastLogTime = now;
  }
}

function handleIncomingItem(
  item: BrokerItem<CompletionChunkData>,
  state: QueryStreamState,
  res: Response,
  req: Request,
  queryName: string,
  cleanup: () => void
): void {
  // Re-arm the idle timeout on every chunk: the bound is inter-chunk silence,
  // not time-to-first-chunk, so a stream that stalls after some chunks (e.g. the
  // executor dies before [DONE]) still terminates.
  state.rearmIdleTimeout();
  if (!state.caughtUp) {
    state.buffer.push(item);
    return;
  }
  writeLiveChunk(res, req, item, queryName, state.counters, cleanup);
}

function flushBuffer(
  res: Response,
  req: Request,
  queryName: string,
  buffer: BrokerItem<CompletionChunkData>[],
  maxReplayedSeq: number,
  counters: StreamCounters,
  cleanup: () => void,
  onComplete: () => void
): boolean {
  for (const bufferedItem of buffer) {
    if (bufferedItem.sequenceNumber <= maxReplayedSeq) continue;
    if (bufferedItem.data.complete) {
      onComplete();
      return false;
    }
    const chunk = bufferedItem.data.chunk as ChunkPayload | string;
    if (typeof chunk === 'string') continue;

    if (chunk.error) {
      const streamError = chunk.error;
      if (
        typeof streamError.message !== 'string' ||
        typeof streamError.type !== 'string'
      ) {
        req.log.error({queryName, chunk}, 'invalid error chunk structure');
        sendInternalError(res, req.id);
        cleanup();
        return false;
      }
      writeSSEEvent(res, chunk, req.log);
      res.write('data: [DONE]\n\n');
      res.end();
      cleanup();
      return false;
    }

    if (!writeSSEEvent(res, chunk, req.log)) {
      req.log.warn({queryName}, 'error writing buffered chunk');
      cleanup();
      return false;
    }

    counters.outboundChunkCount++;
    classifyChunk(chunk, counters.chunkTypeCounts);
  }
  return true;
}

async function replayChunks(
  res: Response,
  req: Request,
  chunks: CompletionChunkBroker,
  queryName: string,
  state: QueryStreamState,
  cleanup: () => void,
  onComplete: () => void
): Promise<boolean> {
  const existingItems = await chunks.getByQuery(queryName);
  req.log.info(
    {queryName, count: existingItems.length},
    'sending existing chunks for replay'
  );

  let maxReplayedSeq = -1;
  for (const item of existingItems) {
    if (item.data.complete) {
      req.log.info({queryName}, 'found complete during replay, closing stream');
      res.write('data: [DONE]\n\n');
      res.end();
      cleanup();
      return false;
    }
    const chunk = item.data.chunk as ChunkPayload | string;
    if (typeof chunk === 'string') continue;
    if (!writeSSEEvent(res, chunk, req.log)) {
      req.log.warn({queryName}, 'error writing existing chunk');
      cleanup();
      return false;
    }
    if (item.sequenceNumber > maxReplayedSeq) {
      maxReplayedSeq = item.sequenceNumber;
    }
  }

  return flushBuffer(
    res,
    req,
    queryName,
    state.buffer,
    maxReplayedSeq,
    state.counters,
    cleanup,
    onComplete
  );
}

function onIdleTimeout(
  res: Response,
  req: Request,
  queryName: string,
  timeout: number,
  cleanup: () => void
): void {
  // Fires when no chunk (or terminal [DONE]) arrives within the idle window,
  // whether or not any chunk was seen. Terminates the subscriber cleanly with a
  // terminal [DONE] so it never hangs on a stream that lost its completion.
  req.log.warn({queryName, timeout}, 'stream idle timeout; terminating');
  const errorEvent = {
    error: {
      message: 'Streaming query response timed out',
      type: 'timeout_error',
      code: 'timeout',
    },
  };
  res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
  cleanup();
}

function onStreamClose(
  req: Request,
  queryName: string,
  state: QueryStreamState,
  cleanup: () => void
): void {
  req.log.info({queryName}, 'client disconnected');
  if (state.timeoutHandle) clearTimeout(state.timeoutHandle);
  cleanup();
}

function onStreamError(
  req: Request,
  error: Error & {code?: string},
  queryName: string,
  state: QueryStreamState,
  cleanup: () => void
): void {
  if (error.code === 'ECONNRESET') {
    req.log.info({queryName}, 'client connection reset');
  } else {
    req.log.error({err: error, queryName}, 'client connection error');
  }
  if (state.timeoutHandle) clearTimeout(state.timeoutHandle);
  cleanup();
}

export async function handleQueryStream(
  req: Request,
  res: Response,
  chunks: CompletionChunkBroker,
  queryName: string,
  fromBeginning: boolean,
  waitForQuerySeconds: number | undefined,
  maxChunkSize: number,
  idleTimeoutMs: number
): Promise<void> {
  const waitForQuery = waitForQuerySeconds !== undefined;
  // Time allowed before the first chunk: wait-for-query widens it when supplied,
  // otherwise fall back to the idle window. Subsequent chunks re-arm at
  // idleTimeoutMs (see handleIncomingItem).
  const initialTimeout =
    waitForQuerySeconds === undefined
      ? idleTimeoutMs
      : Math.max(1000, Math.min(waitForQuerySeconds * 1000, 300000));

  req.log.info(
    {
      queryName,
      fromBeginning,
      waitForQuery,
      initialTimeout,
      idleTimeoutMs,
      maxChunkSize,
    },
    'starting query stream'
  );

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const state: QueryStreamState = {
    caughtUp: false,
    timeoutHandle: undefined,
    rearmIdleTimeout: (): void => {},
    buffer: [],
    counters: {
      outboundChunkCount: 0,
      lastLogTime: Date.now(),
      chunkTypeCounts: {content: 0, tool_calls: 0, finish_reason: 0, other: 0},
    },
  };

  const unsubHandles = {chunks: (): void => {}};
  const cleanup = (): void => {
    if (state.timeoutHandle) clearTimeout(state.timeoutHandle);
    unsubHandles.chunks();
  };

  const armIdleTimeout = (ms: number): void => {
    if (state.timeoutHandle) clearTimeout(state.timeoutHandle);
    state.timeoutHandle = setTimeout(
      () => onIdleTimeout(res, req, queryName, ms, cleanup),
      ms
    );
  };
  state.rearmIdleTimeout = (): void => armIdleTimeout(idleTimeoutMs);

  const completeHandler = (): void => {
    req.log.info(
      {
        queryName,
        total: state.counters.outboundChunkCount,
        types: state.counters.chunkTypeCounts,
      },
      'query complete, sending [DONE] and closing stream'
    );
    res.write('data: [DONE]\n\n');
    res.end();
    cleanup();
  };

  unsubHandles.chunks = chunks.subscribeToQuery(queryName, (item) => {
    if (item.data.complete) {
      completeHandler();
      return;
    }
    handleIncomingItem(item, state, res, req, queryName, cleanup);
  });

  // Always arm an idle timeout so every subscriber is bounded, not just those
  // that pass wait-for-query. Re-armed on each chunk in handleIncomingItem.
  armIdleTimeout(initialTimeout);

  if (fromBeginning) {
    const ok = await replayChunks(
      res,
      req,
      chunks,
      queryName,
      state,
      cleanup,
      completeHandler
    );
    if (!ok) return;
  }
  state.caughtUp = true;

  req.on('close', () => onStreamClose(req, queryName, state, cleanup));
  req.on('error', (e: Error & {code?: string}) =>
    onStreamError(req, e, queryName, state, cleanup)
  );
}

export function processNDJSONData(
  rawChunk: Buffer,
  state: {
    buffer: string;
    chunkCount: number;
    lastLogTime: number;
    chunkTypeCounts: Record<string, number>;
    appendChain: Promise<void>;
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
        const streamChunk = JSON.parse(line) as unknown;
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

        state.appendChain = state.appendChain
          .then(() => chunks.addChunk(queryId, streamChunk))
          .then(() => undefined);
      } catch (parseError) {
        log.error({err: parseError, queryId}, 'failed to parse chunk');
      }
    }
  }
}
