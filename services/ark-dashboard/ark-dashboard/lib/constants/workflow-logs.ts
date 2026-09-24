function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const WORKFLOW_LOG_PAGE_LINES = readPositiveInt(
  process.env.NEXT_PUBLIC_WORKFLOW_LOG_PAGE_LINES,
  1000,
);

export const WORKFLOW_LOG_MAX_BYTES = readPositiveInt(
  process.env.NEXT_PUBLIC_WORKFLOW_LOG_MAX_BYTES,
  1024 * 1024,
);

export const WORKFLOW_LOG_POLL_INTERVAL_MS = readPositiveInt(
  process.env.NEXT_PUBLIC_WORKFLOW_LOG_POLL_INTERVAL_MS,
  3000,
);
