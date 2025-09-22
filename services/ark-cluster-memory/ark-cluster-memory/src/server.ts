import express from 'express';
import cors from 'cors';
import { MemoryStore } from './memory-store.js';
import { StreamStore } from './stream-store.js';
import { createMemoryRouter } from './routes/memory.js';
import { createStreamRouter } from './routes/stream.js';

const app = express();
const memory = new MemoryStore();
const stream = new StreamStore();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the service
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: OK
 *       503:
 *         description: Service is unavailable
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Service Unavailable
 */
app.get('/health', (req, res) => {
  try {
    const isHealthy = memory.isHealthy();
    if (isHealthy) {
      res.status(200).send('OK');
    } else {
      res.status(503).send('Service Unavailable');
    }
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).send('Service Unavailable');
  }
});


// Statistics endpoints - separate from main data endpoints to avoid conflicts
app.get('/stream-statistics', (req, res) => {
  try {
    const allStreams = stream.getAllStreams();
    const status: any = {};
    
    for (const [queryID, chunks] of Object.entries(allStreams)) {
      const isComplete = stream.isStreamComplete(queryID);
      const hasDoneMarker = chunks.some((chunk: any) => chunk === '[DONE]');
      
      // Count chunk types
      const chunkTypes: any = {
        content: 0,
        tool_calls: 0,
        finish_reason: 0,
        unknown: 0
      };
      
      for (const chunk of chunks) {
        if (chunk === '[DONE]') continue;
        
        if ((chunk as any)?.choices?.[0]?.delta?.content) {
          chunkTypes.content++;
        } else if ((chunk as any)?.choices?.[0]?.delta?.tool_calls !== undefined && 
                   (chunk as any)?.choices?.[0]?.delta?.tool_calls !== null && 
                   (chunk as any)?.choices?.[0]?.delta?.tool_calls.length > 0) {
          chunkTypes.tool_calls++;
        } else if ((chunk as any)?.choices?.[0]?.finish_reason) {
          chunkTypes.finish_reason++;
        } else {
          chunkTypes.unknown++;
        }
      }
      
      status[queryID] = {
        total_chunks: chunks.length,
        completed: isComplete,
        has_done_marker: hasDoneMarker,
        chunk_types: chunkTypes
      };
    }
    
    res.json({
      total_queries: Object.keys(allStreams).length,
      queries: status
    });
  } catch (error) {
    console.error('Failed to get stream statistics:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Mount route modules
app.use('/', createMemoryRouter(memory));
app.use('/stream', createStreamRouter(stream));

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
export { memory, stream };
