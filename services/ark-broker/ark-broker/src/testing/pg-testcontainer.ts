import {readFileSync} from 'fs';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import postgres from 'postgres';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations'
);

export type StartedPgContainer = {
  container: StartedPostgreSqlContainer;
  connectionUrl: string;
  stop: () => Promise<void>;
};

export async function startPgContainer(): Promise<StartedPgContainer> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const connectionUrl = container.getConnectionUri();

  const upSql = readFileSync(
    join(MIGRATIONS_DIR, '000001_create_messages.up.sql'),
    'utf8'
  );

  const sql = postgres(connectionUrl, {max: 1});
  try {
    await sql.unsafe(upSql);
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
