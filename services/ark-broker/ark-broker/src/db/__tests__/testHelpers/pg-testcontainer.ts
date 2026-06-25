import {readFileSync, readdirSync, writeFileSync} from 'fs';
import {join} from 'path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import postgres from 'postgres';
import {generate as generateCert} from 'selfsigned';
import tmp from 'tmp';
import type {Db} from '@ark-broker/db/db.js';

tmp.setGracefulCleanup();

const MIGRATIONS_DIR = join(process.cwd(), 'src', 'db', 'migrations');
const PG_SSL_DIR = '/etc/ssl/pg-test';

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
  const notAfterDate = new Date();
  notAfterDate.setDate(notAfterDate.getDate() + 1);
  const pems = await generateCert([{name: 'commonName', value: 'localhost'}], {
    notAfterDate,
    keySize: 2048,
  });

  const certDir = tmp.dirSync({prefix: 'pg-ssl-', unsafeCleanup: true});
  const keyPath = join(certDir.name, 'server.key');
  const certPath = join(certDir.name, 'server.crt');
  writeFileSync(keyPath, pems.private, {mode: 0o600});
  writeFileSync(certPath, pems.cert, {mode: 0o644});

  const container = await new PostgreSqlContainer('postgres:16')
    .withCopyContentToContainer([
      {
        content: readFileSync(keyPath),
        target: `${PG_SSL_DIR}/server.key`,
        mode: 0o600,
      },
      {
        content: readFileSync(certPath),
        target: `${PG_SSL_DIR}/server.crt`,
        mode: 0o644,
      },
    ])
    .start();

  certDir.removeCallback();

  const chownResult = await container.exec([
    'chown',
    'postgres:postgres',
    `${PG_SSL_DIR}/server.key`,
    `${PG_SSL_DIR}/server.crt`,
  ]);
  if (chownResult.exitCode !== 0) {
    throw new Error(
      `chown failed (exit ${chownResult.exitCode}): ${chownResult.output}`
    );
  }

  const chmodResult = await container.exec([
    'chmod',
    '600',
    `${PG_SSL_DIR}/server.key`,
  ]);
  if (chmodResult.exitCode !== 0) {
    throw new Error(
      `chmod failed (exit ${chmodResult.exitCode}): ${chmodResult.output}`
    );
  }

  const adminDb = postgres(container.getConnectionUri(), {max: 1});
  try {
    await adminDb.unsafe(`ALTER SYSTEM SET ssl = on`);
    await adminDb.unsafe(
      `ALTER SYSTEM SET ssl_cert_file = '${PG_SSL_DIR}/server.crt'`
    );
    await adminDb.unsafe(
      `ALTER SYSTEM SET ssl_key_file = '${PG_SSL_DIR}/server.key'`
    );
    await adminDb`SELECT pg_reload_conf()`;
  } finally {
    await adminDb.end();
  }

  const baseUrl = container.getConnectionUri();
  let sslReady = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const probe = postgres(`${baseUrl}?sslmode=require`, {max: 1});
    try {
      await probe`SELECT 1`;
      await probe.end();
      sslReady = true;
      break;
    } catch {
      await probe.end();
      await new Promise<void>((r) => setTimeout(r, 200));
    }
  }
  if (!sslReady) {
    throw new Error('Postgres SSL did not become available after reload');
  }

  const connectionUrl = `${baseUrl}?sslmode=require`;
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
