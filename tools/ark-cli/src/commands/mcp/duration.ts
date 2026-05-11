const UNIT_MS: Record<string, number> = {
  ns: 1 / 1_000_000,
  us: 1 / 1000,
  µs: 1 / 1000,
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
};

export function parseGoDuration(value: string): number {
  if (!value) {
    throw new Error(
      '--timeout must be a Go-duration string (e.g. 60s, 5m)'
    );
  }
  const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;
  let total = 0;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    consumed += match[0].length;
    total += parseFloat(match[1]) * UNIT_MS[match[2]];
  }
  if (consumed !== value.length || total <= 0) {
    throw new Error(
      `--timeout must be a positive Go-duration string (e.g. 60s, 5m), got "${value}"`
    );
  }
  return Math.round(total);
}
