import {randomUUID} from 'node:crypto';
import type {RequestHandler} from 'express';

export const REQUEST_ID_HEADER = 'X-Request-ID';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming && incoming.length > 0 ? incoming : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};
