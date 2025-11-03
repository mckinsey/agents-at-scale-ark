import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export interface MCPAdapter {
  createServer(): Promise<Server>;
}
