#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const outDir = path.join(__dirname, 'out');

// Parse command line arguments
const args = process.argv.slice(2);
const includeExternal = args.includes('--include-external');

// Find an available port
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function main() {
  const port = await getAvailablePort();

  console.log(`Starting local server on port ${port}...`);

  const serve = spawn('npx', ['serve', outDir, '-l', port.toString()], {
    stdio: 'pipe'
  });

  // Wait a bit for server to start
  setTimeout(() => {
    const mode = includeExternal ? 'internal and external' : 'internal only';
    console.log(`Checking links at http://localhost:${port} (${mode})`);

    // Build command based on mode
    const blcArgs = ['blc', `http://localhost:${port}`, '--recursive', '--ordered'];
    if (!includeExternal) {
      blcArgs.push('--exclude-external');
    }

    const blc = spawn('npx', blcArgs, {
      stdio: 'inherit'
    });

    blc.on('close', (code) => {
      console.log('Stopping server...');
      serve.kill('SIGTERM');
      process.exit(code);
    });

    blc.on('error', (err) => {
      console.error('Error running link checker:', err);
      serve.kill('SIGTERM');
      process.exit(1);
    });
  }, 3000);
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});