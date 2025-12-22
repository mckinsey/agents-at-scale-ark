import { Request, Response } from 'express';

export const writeSSEEvent = (res: Response, data: unknown): boolean => {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    console.error('Error writing SSE event:', error);
    return false;
  }
};

const SSE_HEARTBEAT_INTERVAL_MS = 30000;

export const startSSEHeartbeat = (res: Response): ReturnType<typeof setInterval> => {
  return setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // Ignore write errors - client may have disconnected
    }
  }, SSE_HEARTBEAT_INTERVAL_MS);
};

interface SSEStreamOptions {
  res: Response;
  req: Request;
  tag: string;
  itemName: string;
  subscribe: (callback: (item: any) => void) => () => void;
  replayItems?: any[];
  filter?: (item: any) => boolean;
  identifier?: string;
}

export const streamSSE = (options: SSEStreamOptions): void => {
  const { res, req, tag, itemName, subscribe, replayItems, filter, identifier } = options;
  const idStr = identifier ? ` ${identifier}` : '';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.write(': connected\n\n');

  const heartbeat = startSSEHeartbeat(res);

  let itemCount = 0;
  let lastLogTime = Date.now();

  if (replayItems && replayItems.length > 0) {
    console.log(`[${tag}] Sending ${replayItems.length} existing ${itemName} for${idStr}`);
    for (const item of replayItems) {
      if (!writeSSEEvent(res, item)) {
        console.log(`[${tag}-OUT]${idStr}: Error writing existing ${itemName.slice(0, -1)}`);
        clearInterval(heartbeat);
        return;
      }
      itemCount++;
    }
  }

  const unsubscribe = subscribe((item: any) => {
    if (filter && !filter(item)) {
      return;
    }

    if (!writeSSEEvent(res, item)) {
      console.log(`[${tag}-OUT]${idStr}: Client disconnected (write failed)`);
      clearInterval(heartbeat);
      unsubscribe();
      return;
    }

    itemCount++;
    const now = Date.now();
    if (now - lastLogTime >= 1000) {
      console.log(`[${tag}-OUT]${idStr}: Streamed ${itemCount} ${itemName}`);
      lastLogTime = now;
    }
  });

  req.on('close', () => {
    console.log(`[${tag}-OUT]${idStr}: Client disconnected after ${itemCount} ${itemName}`);
    clearInterval(heartbeat);
    unsubscribe();
  });

  req.on('error', (error: Error & { code?: string }) => {
    if (error.code === 'ECONNRESET') {
      console.log(`[${tag}-OUT]${idStr}: Client connection reset`);
    } else {
      console.error(`[${tag}-OUT]${idStr}: Client connection error:`, error);
    }
    clearInterval(heartbeat);
    unsubscribe();
  });
};
