import {readFileSync} from 'fs';
import postgres from 'postgres';
import type {AppConfig} from '@ark-broker/config/index.js';
import type {Logger} from '@ark-broker/logging/logger.js';

export type Db = ReturnType<typeof postgres>;

export function createDb(config: AppConfig, logger: Logger): Db {
  const log = logger.child({module: 'db'});
  const {database} = config;

  const ssl = database.sslRootCertPath
    ? {ca: readFileSync(database.sslRootCertPath)}
    : undefined;

  return postgres(config.database.url!, {
    max: database.poolMax,
    connect_timeout: database.connectTimeoutMs / 1000,
    connection: {
      statement_timeout: database.statementTimeoutMs,
    },
    ...(ssl ? {ssl} : {}),
    ...(database.debugQueries
      ? {
          debug: (
            connectionId: number,
            query: string,
            parameters: unknown[]
          ): void => {
            log.info({connectionId, paramCount: parameters.length}, query);
          },
        }
      : {}),
  });
}

export async function pingDb(db: Db): Promise<void> {
  await db`SELECT 1`;
}
