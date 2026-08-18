import type {Request, Response} from 'express';
import type {Registry} from 'prom-client';
import {sendInternalError} from '@ark-broker/http/routes/errors.js';

export async function handleGetMetrics(
  req: Request,
  res: Response,
  registry: Registry
): Promise<void> {
  try {
    const body = await registry.metrics();
    res.setHeader('Content-Type', registry.contentType);
    res.send(body);
  } catch (error) {
    req.log.error({err: error}, 'failed to collect metrics');
    sendInternalError(res, req.id);
  }
}
