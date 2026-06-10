import {Router} from 'express';
import type {Request, Response} from 'express';
import express from 'express';
import {TraceBroker, OTELSpan} from '@ark-broker/brokers/trace-broker.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import protobuf from 'protobufjs';
import {join} from 'path';

let ExportTraceServiceRequest: protobuf.Type | null = null;

async function loadProtoDefinitions(logger: Logger): Promise<void> {
  if (ExportTraceServiceRequest) return;

  try {
    const protoRootDir = join(process.cwd(), 'proto');
    const protoPath = join(
      protoRootDir,
      'opentelemetry/proto/collector/trace/v1/trace_service.proto'
    );

    const root = new protobuf.Root();
    root.resolvePath = (origin: string, target: string): string => {
      if (target.startsWith('opentelemetry/')) {
        return join(protoRootDir, target);
      }
      return target;
    };

    await root.load(protoPath);

    ExportTraceServiceRequest = root.lookupType(
      'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest'
    );
    logger.info('proto definitions loaded');
  } catch (err) {
    logger.error({err}, 'failed to load proto definitions');
    throw err;
  }
}

type AttrValue = {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: unknown;
  kvlistValue?: unknown;
};

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: Array<{key: string; value: AttrValue}>;
  status?: {code?: number; message?: string};
}

interface OTLPRequest {
  resourceSpans?: Array<{
    resource?: {
      attributes?: Array<{key: string; value: AttrValue}>;
    };
    scopeSpans?: Array<{
      scope?: unknown;
      spans?: OTLPSpan[];
    }>;
  }>;
}

function decodeOTLPBody(req: Request, res: Response): OTLPRequest | null {
  const contentType = req.headers['content-type'] || '';

  if (!contentType.includes('application/x-protobuf')) {
    return req.body as OTLPRequest;
  }

  if (!Buffer.isBuffer(req.body)) {
    req.log.error({bodyType: typeof req.body}, 'expected Buffer for protobuf');
    res.status(400).json({error: 'Invalid protobuf data'});
    return null;
  }

  if (!ExportTraceServiceRequest) {
    req.log.error('proto definitions unavailable');
    res.status(503).json({error: 'Protobuf schema unavailable'});
    return null;
  }

  try {
    const uint8Array = new Uint8Array(req.body);
    const decoded = ExportTraceServiceRequest.decode(uint8Array);
    return ExportTraceServiceRequest.toObject(decoded, {
      longs: String,
      enums: String,
      bytes: String,
      defaults: true,
      arrays: true,
      objects: true,
    }) as OTLPRequest;
  } catch (err) {
    req.log.error({err}, 'failed to decode protobuf');
    res.status(400).json({error: 'Failed to decode protobuf data'});
    return null;
  }
}

function buildSpans(body: OTLPRequest): OTELSpan[] {
  const spans: OTELSpan[] = [];
  for (const resourceSpan of body.resourceSpans ?? []) {
    const resourceAttrs = resourceSpan.resource?.attributes ?? [];
    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const otlpSpan of scopeSpan.spans ?? []) {
        spans.push({
          traceId: otlpSpan.traceId,
          spanId: otlpSpan.spanId,
          parentSpanId: otlpSpan.parentSpanId,
          name: otlpSpan.name,
          kind: otlpSpan.kind,
          startTimeUnixNano: otlpSpan.startTimeUnixNano,
          endTimeUnixNano: otlpSpan.endTimeUnixNano,
          attributes: convertAttributes(otlpSpan.attributes ?? []),
          status: otlpSpan.status,
          resource: convertAttributesToObject(resourceAttrs),
        });
      }
    }
  }
  return spans;
}

export function createOTLPRouter(traces: TraceBroker, logger: Logger): Router {
  const router = Router();

  loadProtoDefinitions(logger).catch((err) => {
    logger.error({err}, 'failed to load proto definitions');
    process.exit(1);
  });

  router.use(
    express.raw({
      type: 'application/x-protobuf',
      limit: '10mb',
    }) as express.RequestHandler
  );

  router.post('/traces', async (req, res) => {
    try {
      const body = decodeOTLPBody(req, res);
      if (!body) return;

      if (!body.resourceSpans) {
        res.status(400).json({
          error: 'Invalid OTLP request format. Expected resourceSpans array.',
        });
        return;
      }

      const spans = buildSpans(body);
      await traces.addSpans(spans);
      req.log.info({count: spans.length}, 'received spans');
      res.status(200).json({});
    } catch (err) {
      req.log.error({err}, 'failed to process request');
      const e = err as Error;
      res.status(500).json({error: e.message});
    }
  });

  return router;
}

function convertAttributes(
  attrs: Array<{key: string; value: AttrValue}>
): Array<{
  key: string;
  value: {stringValue?: string; intValue?: number; boolValue?: boolean};
}> {
  return attrs.map((attr) => ({key: attr.key, value: attr.value}));
}

function convertAttributesToObject(
  attrs: Array<{key: string; value: AttrValue}>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const attr of attrs) {
    result[attr.key] = extractValue(attr.value);
  }
  return result;
}

function extractValue(value: AttrValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.intValue !== undefined) return value.intValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.arrayValue !== undefined) return value.arrayValue;
  if (value.kvlistValue !== undefined) return value.kvlistValue;
  return value;
}
