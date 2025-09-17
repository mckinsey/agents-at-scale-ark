#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

const outDir = path.join(__dirname, 'out');

// Parse command line arguments
const args = process.argv.slice(2);
const includeExternal = args.includes('--include-external');

// Check if site was built with a base path by looking at the generated HTML
function detectBasePath() {
  try {
    const indexPath = path.join(outDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf8');
      // Look for base path in links - Next.js will prefix all hrefs with the base path
      const match = content.match(/href="(\/[^/]+?)\/quickstart\//);
      if (match && match[1] !== '') {
        return match[1];
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return '';
}

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
  const basePath = detectBasePath();

  if (basePath) {
    console.error(`Error: Site was built with base path "${basePath}"`);
    console.error('Link checking with base paths is not supported.');
    console.error('Please rebuild without NEXT_PUBLIC_BASE_PATH for local link checking.');
    process.exit(1);
  }

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