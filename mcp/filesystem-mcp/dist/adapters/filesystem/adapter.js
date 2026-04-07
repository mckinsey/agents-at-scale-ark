import { createServer } from './index.js';
export class FilesystemAdapter {
    async createServer() {
        return createServer();
    }
}
