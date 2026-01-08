import express from 'express';
import cors from 'cors';
import { MemoryBroker } from './memory-broker.js';
import { CompletionChunkBroker } from './completion-chunk-broker.js';
import { TraceBroker } from './trace-broker.js';
import { EventBroker } from './event-broker.js';
import { createMemoryRouter } from './routes/memory.js';
import { createStreamRouter } from './routes/stream.js';
import { createTracesRouter } from './routes/traces.js';
import { createEventsRouter } from './routes/events.js';
import { createOTLPRouter } from './routes/otlp.js';

const app = express();

const maxMessages = process.env.MAX_MESSAGES ? parseInt(process.env.MAX_MESSAGES, 10) : 0;
const maxChunks = process.env.MAX_CHUNKS ? parseInt(process.env.MAX_CHUNKS, 10) : 0;
const maxSpans = process.env.MAX_SPANS ? parseInt(process.env.MAX_SPANS, 10) : 0;
const maxEvents = process.env.MAX_EVENTS ? parseInt(process.env.MAX_EVENTS, 10) : 0;

const memory = new MemoryBroker(process.env.MEMORY_FILE_PATH, maxMessages);
const chunks = new CompletionChunkBroker(process.env.STREAM_FILE_PATH, maxChunks);
const traces = new TraceBroker(process.env.TRACE_FILE_PATH, maxSpans);
const events = new EventBroker(process.env.EVENT_FILE_PATH, maxEvents);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

app.use('/', createMemoryRouter(memory));
app.use('/stream', createStreamRouter(chunks));
app.use('/traces', createTracesRouter(traces));
app.use('/events', createEventsRouter(events));
app.use('/v1', createOTLPRouter(traces));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
export { memory, chunks, traces, events };
