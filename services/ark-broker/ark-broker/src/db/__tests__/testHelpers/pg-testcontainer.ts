import {readFileSync, readdirSync} from 'fs';
import {join} from 'path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import postgres from 'postgres';
import type {Db} from '@ark-broker/db/db.js';

const MIGRATIONS_DIR = join(process.cwd(), 'src', 'db', 'migrations');
const SSL_WRAPPER_SCRIPT = [
  '#!/bin/sh',
  'set -e',
  'mkdir -p /tmp/pg-ssl',
  'openssl req -newkey rsa:2048 -nodes \\',
  '  -keyout /tmp/pg-ssl/server.key \\',
  '  -x509 -days 1 \\',
  '  -out /tmp/pg-ssl/server.crt \\',
  '  -subj "/CN=localhost" 2>/dev/null',
  'chown 999:999 /tmp/pg-ssl/server.key /tmp/pg-ssl/server.crt',
  'chmod 600 /tmp/pg-ssl/server.key',
  'exec docker-entrypoint.sh "$@"',
].join('\n');

export type StartedPgContainer = {
  container: StartedPostgreSqlContainer;
  connectionUrl: string;
  stop: () => Promise<void>;
};

async function runMigrations(connectionUrl: string): Promise<void> {
  const upFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.up.sql'))
    .sort();

  const sql = postgres(connectionUrl, {max: 1});
  try {
    for (const file of upFiles) {
      await sql.unsafe(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    }
  } finally {
    await sql.end();
  }
}

export async function startPgContainer(): Promise<StartedPgContainer> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const connectionUrl = container.getConnectionUri();
  await runMigrations(connectionUrl);
  return {
    container,
    connectionUrl,
    stop: async (): Promise<void> => {
      await container.stop();
    },
  };
}

export async function startPgContainerSsl(): Promise<StartedPgContainer> {
  const container = await new PostgreSqlContainer('postgres:16')
    .withCopyContentToContainer([
      {
        content: SSL_WRAPPER_SCRIPT,
        target: '/tmp/pg-entrypoint.sh',
        mode: 0o755,
      },
    ])
    .withEntrypoint(['sh', '/tmp/pg-entrypoint.sh'])
    .withCommand([
      'postgres',
      '-c',
      'ssl=on',
      '-c',
      'ssl_cert_file=/tmp/pg-ssl/server.crt',
      '-c',
      'ssl_key_file=/tmp/pg-ssl/server.key',
    ])
    .start();

  const connectionUrl = `${container.getConnectionUri()}?sslmode=require`;
  await runMigrations(connectionUrl);
  return {
    container,
    connectionUrl,
    stop: async (): Promise<void> => {
      await container.stop();
    },
  };
}

export async function truncateAllTables(db: Db): Promise<void> {
  const tables = await db<{tablename: string}[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  if (tables.length === 0) return;
  await db.unsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
}

function usePgContainerFrom(starter: () => Promise<StartedPgContainer>): {
  db: () => Db;
  connectionUrl: () => string;
} {
  let _db: Db;
  let _stop: () => Promise<void>;
  let _connectionUrl: string;

  beforeAll(async () => {
    const pg = await starter();
    _stop = pg.stop;
    _connectionUrl = pg.connectionUrl;
    _db = postgres(pg.connectionUrl, {max: 5});
  });

  afterAll(async () => {
    await _db.end({timeout: 5});
    await _stop();
  });

  beforeEach(async () => {
    await truncateAllTables(_db);
  });

  return {db: () => _db, connectionUrl: () => _connectionUrl};
}

export function usePgContainer(): {db: () => Db; connectionUrl: () => string} {
  return usePgContainerFrom(startPgContainer);
}

export function usePgContainerSsl(): {
  db: () => Db;
  connectionUrl: () => string;
} {
  return usePgContainerFrom(startPgContainerSsl);
}
