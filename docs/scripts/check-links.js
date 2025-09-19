#!/usr/bin/env node
/**
 * Helper script to check documentation links using broken-link-checker (blc).
 * This script starts a local server to serve the built documentation and then
 * runs blc to check for broken links. The documentation must be built first
 * using 'npm run build' which outputs to the 'out' directory.
 *
 * Usage: node scripts/check-links.js [--include-external]
 */

const { spawn } = require('child_process');
const net = require('net');

const includeExternal = process.argv.includes('--include-external');

// Get available port from system
const server = net.createServer();
server.listen(0, () => {
  const port = server.address().port;
  server.close(() => {
    // Start serve on the available port
    const serve = spawn('npx', ['serve', 'out', '-l', port], {
      stdio: 'pipe'
    });

    // Wait for server to start then run link checker
    setTimeout(() => {
      const args = ['blc', `http://localhost:${port}`, '--recursive', '--ordered'];
      if (!includeExternal) {
        args.push('--exclude-external');
      }

      const blc = spawn('npx', args, {
        stdio: 'inherit'
      });

      blc.on('close', (code) => {
        serve.kill();
        process.exit(code);
      });
    }, 3000);
  });
});