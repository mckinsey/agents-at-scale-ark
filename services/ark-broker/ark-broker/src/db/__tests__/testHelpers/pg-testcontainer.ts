import {readFileSync, readdirSync} from 'fs';
import {join} from 'path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import postgres from 'postgres';
import type {Db} from '@ark-broker/db/db.js';

const MIGRATIONS_DIR = join(process.cwd(), 'src', 'db', 'migrations');

export type StartedPgContainer = {
  container: StartedPostgreSqlContainer;
  connectionUrl: string;
  stop: () => Promise<void>;
};

export async function startPgContainer(): Promise<StartedPgContainer> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const connectionUrl = container.getConnectionUri();

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

export function usePgContainer(): {db: () => Db; connectionUrl: () => string} {
  let _db: Db;
  let _stop: () => Promise<void>;
  let _connectionUrl: string;

  beforeAll(async () => {
    const pg = await startPgContainer();
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
