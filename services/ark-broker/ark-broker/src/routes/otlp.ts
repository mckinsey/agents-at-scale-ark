import { Router } from 'express';
import express from 'express';
import { TraceBroker, OTELSpan } from '../trace-broker.js';
import protobuf from 'protobufjs';
import { join } from 'path';

let ExportTraceServiceRequest: protobuf.Type | null = null;

async function loadProtoDefinitions() {
  if (ExportTraceServiceRequest) return;

  try {
    // Proto files are in the project root's proto directory
    // This works whether running from src/ or dist/
    const protoRootDir = join(process.cwd(), 'proto');
    const protoPath = join(protoRootDir, 'opentelemetry/proto/collector/trace/v1/trace_service.proto');

    const root = new protobuf.Root();
    root.resolvePath = (origin: string, target: string) => {
      if (target.startsWith('opentelemetry/')) {
        return join(protoRootDir, target);
      }
      return target;
    };

    await root.load(protoPath);

    ExportTraceServiceRequest = root.lookupType('opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest');
    console.log('[OTLP] Proto definitions loaded successfully');
  } catch (error) {
    console.error('[OTLP] Failed to load proto definitions:', error);
    throw error;
  }
}

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: Array<{ key: string; value: any }>;
  status?: { code?: number; message?: string };
}

interface OTLPRequest {
  resourceSpans?: Array<{
    resource?: {
      attributes?: Array<{ key: string; value: any }>;
    };
    scopeSpans?: Array<{
      scope?: any;
      spans?: OTLPSpan[];
    }>;
  }>;
}

export function createOTLPRouter(traces: TraceBroker): Router {
  const router = Router();

  loadProtoDefinitions().catch(err => {
    console.error('[OTLP] Failed to initialize proto definitions:', err);
  });

  router.use(express.raw({ type: 'application/x-protobuf', limit: '10mb' }));

  router.post('/traces', (req, res) => {
    try {
      const contentType = req.headers['content-type'] || '';
      let body: OTLPRequest;

      if (contentType.includes('application/x-protobuf')) {
        if (!Buffer.isBuffer(req.body)) {
          console.error('[OTLP] Expected Buffer for protobuf, got:', typeof req.body);
          res.status(400).json({ error: 'Invalid protobuf data' });
          return;
        }

        if (!ExportTraceServiceRequest) {
          console.error('[OTLP] Proto definitions not loaded yet');
          res.status(503).json({ error: 'Service initializing, please retry' });
          return;
        }

        try {
          const uint8Array = new Uint8Array(req.body);
          const decoded = ExportTraceServiceRequest.decode(uint8Array);
          body = ExportTraceServiceRequest.toObject(decoded, {
            longs: String,
            enums: String,
            bytes: String,
            defaults: true,
            arrays: true,
            objects: true
          }) as OTLPRequest;
        } catch (error) {
          console.error('[OTLP] Failed to decode protobuf:', error);
          res.status(400).json({ error: 'Failed to decode protobuf data' });
          return;
        }
      } else {
        body = req.body as OTLPRequest;
      }

      if (!body || !body.resourceSpans) {
        res.status(400).json({ error: 'Invalid OTLP request format. Expected resourceSpans array.' });
        return;
      }

      const spans: OTELSpan[] = [];

      for (const resourceSpan of body.resourceSpans) {
        const resourceAttrs = resourceSpan.resource?.attributes || [];

        for (const scopeSpan of resourceSpan.scopeSpans || []) {
          for (const otlpSpan of scopeSpan.spans || []) {
            spans.push({
              traceId: otlpSpan.traceId,
              spanId: otlpSpan.spanId,
              parentSpanId: otlpSpan.parentSpanId,
              name: otlpSpan.name,
              kind: otlpSpan.kind,
              startTimeUnixNano: otlpSpan.startTimeUnixNano,
              endTimeUnixNano: otlpSpan.endTimeUnixNano,
              attributes: convertAttributes(otlpSpan.attributes || []),
              status: otlpSpan.status,
              resource: convertAttributesToObject(resourceAttrs)
            });
          }
        }
      }

      traces.addSpans(spans);
      console.log(`[OTLP] Received ${spans.length} spans`);
      res.status(200).json({});
    } catch (error) {
      console.error('[OTLP] Failed to process request:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

function convertAttributes(attrs: Array<{ key: string; value: any }>): Array<{ key: string; value: any }> {
  return attrs.map(attr => ({
    key: attr.key,
    value: extractValue(attr.value)
  }));
}

function convertAttributesToObject(attrs: Array<{ key: string; value: any }>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const attr of attrs) {
    result[attr.key] = extractValue(attr.value);
  }
  return result;
}

function extractValue(value: any): any {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.intValue !== undefined) return value.intValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.arrayValue !== undefined) return value.arrayValue;
  if (value.kvlistValue !== undefined) return value.kvlistValue;
  return value;
}
