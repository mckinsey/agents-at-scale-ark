import request from 'supertest';
import express from 'express';
import { CompletionChunkBroker } from '../completion-chunk-broker';
import { createStreamRouter } from './stream';

describe('Streaming API', () => {
  let app: express.Application;
  let chunks: CompletionChunkBroker;

  beforeEach(() => {
    chunks = new CompletionChunkBroker();
    app = express();
    app.use(express.json());
    app.use('/stream', createStreamRouter(chunks));
  });

  // Helper to generate OpenAI chunks
  const createTextChunk = (content: string, index: number = 0) => ({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'gpt-4',
    choices: [{
      index,
      delta: { content }
    }]
  });

  const createToolCallChunk = (toolName: string, args: string, index: number = 0) => ({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'gpt-4',
    choices: [{
      index,
      delta: {
        tool_calls: [{
          index: 0,
          id: `call_${Date.now()}`,
          type: 'function',
          function: {
            name: toolName,
            arguments: args
          }
        }]
      }
    }]
  });

  const createFinishChunk = (reason: string = 'stop') => ({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'gpt-4',
    choices: [{
      index: 0,
      delta: {},
      finish_reason: reason
    }]
  });

  // Helper to send chunks to stream endpoint
  const sendChunks = async (queryId: string, chunks: any[]) => {
    const response = await request(app)
      .post(`/stream/${queryId}`)
      .set('Content-Type', 'application/x-ndjson')
      .send(chunks.map(c => JSON.stringify(c) + '\n').join(''));
    return response;
  };

  // Helper to consume SSE stream with timeout
  const consumeStream = (queryId: string, options: { fromBeginning?: boolean, timeout?: number } = {}): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const events: string[] = [];
      const timeout = setTimeout(() => {
        resolve(events);  // Resolve BEFORE aborting
        req.abort();
      }, options.timeout || 1000);

      let url = `/stream/${queryId}`;
      if (options.fromBeginning) url += '?from-beginning=true';

      const req = request(app)
        .get(url)
        .buffer(false)
        .parse((res, _callback) => {
          let buffer = '';
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            lines.forEach(line => {
              if (line.startsWith('data: ')) {
                events.push(line.substring(6));
              }
            });
          });
          
          res.on('end', () => {
            clearTimeout(timeout);
            resolve(events);
          });
        })
        .end((err) => {
          // Skip abort errors - they're expected when we timeout
          if (err && err !== 'aborted') {
            clearTimeout(timeout);
            reject(err);
          }
        });
    });
  };

  describe('Basic streaming', () => {
    it('should stream text chunks in real-time', async () => {
      const queryId = 'test-query-1';
      const chunks = [
        createTextChunk('Hello'),
        createTextChunk(' world'),
        createTextChunk('!'),
        createFinishChunk()
      ];

      // Start consumer
      const streamPromise = consumeStream(queryId);

      // Wait a bit then send chunks
      await new Promise(resolve => setTimeout(resolve, 100));
      await sendChunks(queryId, chunks);
      
      // Complete the stream
      await request(app).post(`/stream/${queryId}/complete`);

      const events = await streamPromise;
      
      // Verify we got all chunks plus [DONE]
      expect(events.length).toBe(5);
      expect(JSON.parse(events[0]).choices[0].delta.content).toBe('Hello');
      expect(JSON.parse(events[1]).choices[0].delta.content).toBe(' world');
      expect(JSON.parse(events[2]).choices[0].delta.content).toBe('!');
      expect(JSON.parse(events[3]).choices[0].finish_reason).toBe('stop');
      expect(events[4]).toBe('[DONE]');
    });

    it('should handle tool calls with arguments', async () => {
      const queryId = 'test-query-2';
      const chunks = [
        createTextChunk('Let me check the weather'),
        createToolCallChunk('get_weather', '{"location":'),
        createToolCallChunk('get_weather', '"Paris"}'),
        createFinishChunk('tool_calls')
      ];

      const streamPromise = consumeStream(queryId);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      await sendChunks(queryId, chunks);
      await request(app).post(`/stream/${queryId}/complete`);

      const events = await streamPromise;
      
      expect(events.length).toBe(5);
      expect(JSON.parse(events[1]).choices[0].delta.tool_calls).toBeDefined();
      expect(JSON.parse(events[3]).choices[0].finish_reason).toBe('tool_calls');
    });
  });

  describe('Multi-agent streaming', () => {
    it('should handle multiple finish_reason chunks from different agents', async () => {
      const queryId = 'test-query-3';
      
      // Agent 1 response
      const agent1Chunks = [
        createTextChunk('Agent 1 says hello'),
        createFinishChunk()
      ];
      
      // Agent 2 response
      const agent2Chunks = [
        createTextChunk('Agent 2 says hi'),
        createFinishChunk()
      ];

      const streamPromise = consumeStream(queryId);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send first agent chunks
      await sendChunks(queryId, agent1Chunks);
      
      // Send second agent chunks
      await sendChunks(queryId, agent2Chunks);
      
      // Complete the entire query
      await request(app).post(`/stream/${queryId}/complete`);

      const events = await streamPromise;
      
      // Should have both agents' content and finish_reason, plus final [DONE]
      expect(events.length).toBe(5);
      expect(JSON.parse(events[0]).choices[0].delta.content).toBe('Agent 1 says hello');
      expect(JSON.parse(events[1]).choices[0].finish_reason).toBe('stop');
      expect(JSON.parse(events[2]).choices[0].delta.content).toBe('Agent 2 says hi');
      expect(JSON.parse(events[3]).choices[0].finish_reason).toBe('stop');
      expect(events[4]).toBe('[DONE]');
    });
  });

  describe('Late connection scenarios', () => {
    it('should replay all chunks when from-beginning=true', async () => {
      const queryId = 'test-query-4';
      const chunks = [
        createTextChunk('First'),
        createTextChunk(' message'),
        createFinishChunk()
      ];

      // Send chunks before any consumer
      await sendChunks(queryId, chunks);
      
      // Connect late with from-beginning
      const streamPromise = consumeStream(queryId, { fromBeginning: true });
      
      // Complete the stream
      await request(app).post(`/stream/${queryId}/complete`);

      const events = await streamPromise;
      
      expect(events.length).toBe(4);
      expect(JSON.parse(events[0]).choices[0].delta.content).toBe('First');
      expect(events[3]).toBe('[DONE]');
    });

    it('should only get new chunks without from-beginning', async () => {
      const queryId = 'test-query-5';
      const initialChunks = [
        createTextChunk('Old message'),
      ];
      
      // Send initial chunks
      await sendChunks(queryId, initialChunks);
      
      // Connect without from-beginning
      const streamPromise = consumeStream(queryId);
      
      // Send new chunks after connection
      await new Promise(resolve => setTimeout(resolve, 100));
      const newChunks = [
        createTextChunk('New message'),
        createFinishChunk()
      ];
      await sendChunks(queryId, newChunks);
      
      // Complete the stream
      await request(app).post(`/stream/${queryId}/complete`);

      const events = await streamPromise;
      
      // Should only see new chunks
      expect(events.length).toBe(3);
      expect(JSON.parse(events[0]).choices[0].delta.content).toBe('New message');
    });
  });

});
