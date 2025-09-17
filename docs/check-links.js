#!/usr/bin/env node
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

    // Wait for server to start then run link checker
    setTimeout(() => {
      const blc = spawn('npx', ['blc', `http://localhost:${port}`, '--recursive', '--ordered', '--exclude-external'], {
        stdio: 'inherit'
      });

      blc.on('close', (code) => {
        serve.kill();
        process.exit(code);
      });
    }, 3000);
  });
});