#!/usr/bin/env node
/**
 * Helper script to check documentation links using linkinator.
 * This script starts a local server to serve the built documentation and then
 * runs linkinator to check for broken links. The documentation must be built first
 * using 'npm run build' which outputs to the 'out' directory.
 *
 * Usage: node scripts/check-links.js [--include-external]
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const includeExternal = process.argv.includes('--include-external');

// Use absolute path to npx (located alongside node binary)
const npxPath = path.join(path.dirname(process.execPath), 'npx');

// Get available port from system
const server = net.createServer();
server.listen(0, () => {
  const port = server.address().port;
  server.close(() => {
    // Start http-server on the available port
    const serve = spawn(npxPath, ['http-server', 'out', '-p', port], {
      stdio: 'pipe'
    });

    // Wait for server to start then run link checker
    setTimeout(() => {
      const args = ['linkinator', `http://localhost:${port}`, '--recurse'];
      if (!includeExternal) {
        args.push('--skip', `^(?!http://localhost:${port})`);
      }

      const linkinator = spawn(npxPath, args, {
        stdio: 'inherit'
      });

      linkinator.on('close', (code) => {
        serve.kill();
        process.exit(code);
      });
    }, 3000);
  });
});