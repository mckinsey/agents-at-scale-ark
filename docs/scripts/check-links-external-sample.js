#!/usr/bin/env node
/**
 * Sample script to demonstrate checking external links for a single page.
 * This is faster than checking all pages with external links.
 */

const { spawn } = require('child_process');
const net = require('net');

// Get available port from system
const server = net.createServer();
server.listen(0, () => {
  const port = server.address().port;
  server.close(() => {
    // Start serve on the available port
    const serve = spawn('npx', ['serve', 'out', '-l', port], {
      stdio: 'pipe'
    });

    // Wait for server to start then check just the quickstart page including external links
    setTimeout(() => {
      console.log('Checking quickstart page with external links...\n');
      const blc = spawn('npx', ['blc', `http://localhost:${port}/quickstart`, '--ordered'], {
        stdio: 'inherit'
      });

      blc.on('close', (code) => {
        serve.kill();
        console.log(`\nCheck completed with exit code: ${code}`);
        process.exit(code);
      });
    }, 3000);
  });
});