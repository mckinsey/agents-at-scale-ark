import {Router} from 'express';
import type {Registry} from 'prom-client';
import {handleGetMetrics} from './handlers.js';

export function createMetricsRouter(registry: Registry): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    handleGetMetrics(req, res, registry).catch(next);
  });

  return router;
}
