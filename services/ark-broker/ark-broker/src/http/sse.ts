import {Request, Response} from 'express';
import type {Logger} from '@ark-broker/logging/logger.js';

export const writeSSEEvent = (
  res: Response,
  data: unknown,
  logger: Logger
): boolean => {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (err) {
    logger.error({err}, 'error writing SSE event');
    return false;
  }
};

const SSE_HEARTBEAT_INTERVAL_MS = 30000;

export const startSSEHeartbeat = (
  res: Response,
  logger: Logger
): ReturnType<typeof setInterval> => {
  const interval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (err) {
      logger.debug({err}, 'heartbeat write failed, clearing interval');
      clearInterval(interval);
    }
  }, SSE_HEARTBEAT_INTERVAL_MS);
  return interval;
};

interface SSEStreamOptions {
  res: Response;
  req: Request;
  logger: Logger;
  tag: string;
  itemName: string;
  subscribe: (callback: (item: unknown) => void) => () => void;
  getReplay?: () => Promise<unknown[]>;
  getSequence?: (item: unknown) => number;
  filter?: (item: unknown) => boolean;
  identifier?: string;
}

export const streamSSE = (options: SSEStreamOptions): void => {
  const {
    res,
    req,
    logger,
    tag,
    itemName,
    subscribe,
    getReplay,
    getSequence,
    filter,
    identifier,
  } = options;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.write(': connected\n\n');

  const heartbeat = startSSEHeartbeat(res, logger);

  let itemCount = 0;
  let lastLogTime = Date.now();

  let caughtUp = false;
  const buffer: unknown[] = [];

  const unsubscribe = subscribe((item: unknown) => {
    if (filter && !filter(item)) {
      return;
    }

    if (!caughtUp) {
      buffer.push(item);
      return;
    }

    if (!writeSSEEvent(res, item, logger)) {
      logger.info(
        {tag, itemName, identifier},
        'client disconnected (write failed)'
      );
      clearInterval(heartbeat);
      unsubscribe();
      return;
    }

    itemCount++;
    const now = Date.now();
    if (now - lastLogTime >= 1000) {
      logger.debug(
        {tag, itemName, identifier, count: itemCount},
        'streamed items'
      );
      lastLogTime = now;
    }
  });

  void (getReplay ? getReplay() : Promise.resolve([]))
    .then((replay) => {
      if (replay.length > 0) {
        logger.info(
          {tag, itemName, identifier, count: replay.length},
          'sending existing items'
        );
      }

      let maxReplayedSeq = -1;

      for (const item of replay) {
        const seq = getSequence?.(item);
        if (seq !== undefined && seq > maxReplayedSeq) {
          maxReplayedSeq = seq;
        }
        if (!writeSSEEvent(res, item, logger)) {
          logger.warn(
            {tag, itemName, identifier},
            'error writing existing item'
          );
          clearInterval(heartbeat);
          unsubscribe();
          return;
        }
        itemCount++;
      }

      for (const item of buffer) {
        const seq = getSequence?.(item);
        if (seq !== undefined && seq <= maxReplayedSeq) {
          continue;
        }
        if (!writeSSEEvent(res, item, logger)) {
          logger.info(
            {tag, itemName, identifier},
            'client disconnected (write failed)'
          );
          clearInterval(heartbeat);
          unsubscribe();
          return;
        }
        itemCount++;
      }

      caughtUp = true;
    })
    .catch((err: unknown) => {
      logger.error(
        {err, tag, itemName, identifier},
        'error fetching replay items'
      );
      clearInterval(heartbeat);
      unsubscribe();
    });

  req.on('close', () => {
    logger.info(
      {tag, itemName, identifier, count: itemCount},
      'client disconnected'
    );
    clearInterval(heartbeat);
    unsubscribe();
  });

  req.on('error', (error: Error & {code?: string}) => {
    if (error.code === 'ECONNRESET') {
      logger.info({tag, itemName, identifier}, 'client connection reset');
    } else {
      logger.error(
        {tag, itemName, identifier, err: error},
        'client connection error'
      );
    }
    clearInterval(heartbeat);
    unsubscribe();
  });
};
