import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { MCPAdapter } from '../../adapter.js';
import { createServer } from './index.js';

export class FilesystemAdapter implements MCPAdapter {
  async createServer(): Promise<Server> {
    return createServer();
  }
}
