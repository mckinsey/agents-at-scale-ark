import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from './db.js';

export type Reaper = {
  start: () => void;
  // Resolves once the run in flight has finished, so a caller can close the
  // pool without a batch still racing it.
  stop: () => Promise<void>;
  reapOnce: () => Promise<number>;
};

export function createReaper(deps: {
  logger: Logger;
  db: Db;
  tables: string[];
  intervalSeconds: number;
  batchSize: number;
}): Reaper {
  const {logger, db, tables, intervalSeconds, batchSize} = deps;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let stopped = false;
  let inFlight: Promise<void> | undefined;

  const reapOnce = async (): Promise<number> => {
    let total = 0;
    for (const table of tables) {
      let deleted: number;
      do {
        if (stopped) return total;
        const result = await db`
          DELETE FROM ${db(table)}
          WHERE ctid IN (
            SELECT ctid FROM ${db(table)}
            WHERE expires_at < now()
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
          )
        `;
        deleted = result.count;
        total += deleted;
      } while (deleted === batchSize);
    }
    if (total > 0) {
      logger.info({deleted: total}, 'reaped expired rows');
    }
    return total;
  };

  const tick = (): void => {
    if (running) return;
    running = true;
    inFlight = reapOnce()
      .catch((err: unknown) => {
        logger.error({err}, 'reap failed');
      })
      .finally(() => {
        running = false;
      })
      .then(() => undefined);
  };

  return {
    start: (): void => {
      stopped = false;
      tick();
      timer = setInterval(tick, intervalSeconds * 1000);
      timer.unref();
    },
    stop: async (): Promise<void> => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      await inFlight;
    },
    reapOnce,
  };
}
