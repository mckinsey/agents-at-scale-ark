#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

const outDir = path.join(__dirname, 'out');

// Parse command line arguments
const args = process.argv.slice(2);
const includeExternal = args.includes('--include-external');

// Get base path from environment (same as what was used during build)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

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

  let serveArgs = ['serve', outDir, '-l', port.toString()];
  const configPath = path.join(outDir, 'serve.json');

  // If there's a base path, configure serve to handle it
  if (basePath) {
    console.log(`Site built with base path: ${basePath}`);

    // Create serve config with rewrites to handle the base path
    const config = {
      rewrites: [
        {
          source: `${basePath}/:path*`,
          destination: '/:path'
        },
        {
          source: basePath,
          destination: '/index.html'
        }
      ]
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    serveArgs.push('-c', 'serve.json');
  }

  const serve = spawn('npx', serveArgs, {
    stdio: 'pipe'
  });

  // Wait a bit for server to start
  setTimeout(() => {
    const mode = includeExternal ? 'internal and external' : 'internal only';
    const checkUrl = basePath
      ? `http://localhost:${port}${basePath}/`
      : `http://localhost:${port}/`;

    console.log(`Checking links at ${checkUrl} (${mode})`);

    // Build command based on mode
    const blcArgs = ['blc', checkUrl, '--recursive', '--ordered'];
    if (!includeExternal) {
      blcArgs.push('--exclude-external');
    }

    const blc = spawn('npx', blcArgs, {
      stdio: 'inherit'
    });

    blc.on('close', (code) => {
      console.log('Stopping server...');
      serve.kill('SIGTERM');

      // Clean up config file if we created one
      if (basePath && fs.existsSync(configPath)) {
        try {
          fs.unlinkSync(configPath);
        } catch (e) {
          // Ignore errors
        }
      }

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