import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { MCPAdapter } from './adapter.js';
import { FilesystemAdapter } from './adapters/filesystem/adapter.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export type Session = {
  sessionId: string;
  createdAt: string;
  lastAccessed: string;
  config: Record<string, any>;
};

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const SESSION_FILE = process.env.SESSION_FILE || '/data/sessions/sessions.json';
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '1000');
const BASE_DATA_DIR = process.env.BASE_DATA_DIR || '/data';

const app = express();
app.use(express.json());

const adapter: MCPAdapter = new FilesystemAdapter();
const sessions = new Map<string, Session>();
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
const servers: { [sessionId: string]: Server } = {};
const sessionAccessOrder: string[] = [];

function loadSessions(): void {
  if (!existsSync(SESSION_FILE)) {
    console.log('[Session] No existing session file, starting fresh');
    return;
  }

  try {
    const data = readFileSync(SESSION_FILE, 'utf-8');
    const parsed = JSON.parse(data);

    for (const [id, session] of Object.entries(parsed)) {
      sessions.set(id, session as Session);
      sessionAccessOrder.push(id);
    }

    console.log(`[Session] Loaded ${sessions.size} sessions from ${SESSION_FILE}`);
  } catch (error) {
    console.error('[Session] Failed to load sessions:', error);
  }
}

function saveSessions(): void {
  try {
    const dir = dirname(SESSION_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = Object.fromEntries(sessions);
    writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
    console.log(`[Session] Saved ${sessions.size} sessions to ${SESSION_FILE}`);
  } catch (error) {
    console.error('[Session] Failed to save sessions:', error);
  }
}


function updateSessionAccess(sessionId: string): void {
  const index = sessionAccessOrder.indexOf(sessionId);
  if (index !== -1) {
    sessionAccessOrder.splice(index, 1);
  }
  sessionAccessOrder.push(sessionId);

  const session = sessions.get(sessionId);
  if (session) {
    session.lastAccessed = new Date().toISOString();
    sessions.set(sessionId, session);
    console.log(`[Session] Updated access for session ${sessionId}`);
    saveSessions();
  }
}

async function evictOldestSession(): Promise<void> {
  if (sessionAccessOrder.length === 0) return;

  const oldestSessionId = sessionAccessOrder[0];

  console.log(`[Session] Evicting oldest session: ${oldestSessionId}`);

  sessionAccessOrder.shift();
  sessions.delete(oldestSessionId);
  delete transports[oldestSessionId];
  delete servers[oldestSessionId];
  saveSessions();

  console.log(`[Session] Evicted session: ${oldestSessionId}`);
}

async function deleteSession(sessionId: string): Promise<void> {
  console.log(`[Session] Deleting session: ${sessionId}`);

  delete transports[sessionId];
  delete servers[sessionId];
  sessions.delete(sessionId);

  const index = sessionAccessOrder.indexOf(sessionId);
  if (index !== -1) {
    sessionAccessOrder.splice(index, 1);
  }

  saveSessions();
  console.log(`[Session] Deleted session: ${sessionId}`);
}

loadSessions();

app.post('/mcp', async (req, res) => {
  const sessionId = (req.headers['Mcp-Session-Id'] ??
    req.headers['mcp-session-id']) as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport for known session
      transport = transports[sessionId];
      console.log(`[Session] Reusing existing transport for session ${sessionId}`);
      updateSessionAccess(sessionId);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request - create new session
      if (sessions.size >= MAX_SESSIONS) {
        await evictOldestSession();
      }

      const newSessionId = randomUUID();
      const now = new Date().toISOString();
      const session: Session = {
        sessionId: newSessionId,
        createdAt: now,
        lastAccessed: now,
        config: {},
      };

      sessions.set(newSessionId, session);
      sessionAccessOrder.push(newSessionId);
      saveSessions();

      console.log(`[Session] Creating new session ${newSessionId}`);

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          console.log(`[Session] Session initialized with ID: ${sid}`);
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          delete transports[sid];
          delete servers[sid];
          console.log(`[Transport] Closed session ${sid}, session data kept for reconnection`);
        }
      };

      const server = await adapter.createServer();
      servers[newSessionId] = server;
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      // Invalid request - no session ID or not an initialization request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle request with existing transport
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[Session] Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

const handleSessionRequest = async (
  req: express.Request,
  res: express.Response
) => {
  const sessionId = (req.headers['Mcp-Session-Id'] ??
    req.headers['mcp-session-id']) as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    console.log(`[Session] Invalid or missing session ID in ${req.method} ${req.path}`);
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  const transport = transports[sessionId];
  updateSessionAccess(sessionId);
  await transport.handleRequest(req, res);
};
app.get('/mcp', handleSessionRequest);
app.delete('/mcp', handleSessionRequest);

app.delete('/mcp/session', async (req, res) => {
  const sessionId = (req.headers['Mcp-Session-Id'] ??
    req.headers['mcp-session-id']) as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
    console.log(`[Session] DELETE /mcp/session failed - session not found: ${sessionId || 'undefined'}`);
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session not found',
      },
    });
    return;
  }

  await deleteSession(sessionId);
  res.status(204).send();
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT);
console.log(`MCP server listening on port ${PORT}`);
console.log(`Base data directory: ${BASE_DATA_DIR}`);
console.log(`Session file: ${SESSION_FILE}`);
console.log(`Max sessions: ${MAX_SESSIONS}`);
