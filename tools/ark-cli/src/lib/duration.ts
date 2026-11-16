const UNIT_TO_MS: Record<string, number> = {
  ns: 1 / 1_000_000,
  us: 1 / 1_000,
  'µs': 1 / 1_000,
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 60 * 60_000,
};

/**
 * Parse a Go-style duration into milliseconds. Accepts compound durations such
 * as the controller's `metav1.Duration` output (`5m0s`, `1h30m0s`), not just a
 * single unit. Throws on an unparseable value.
 */
export function parseDuration(duration: string): number {
  const token = /^(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/;
  let rest = duration;
  let total = 0;
  let matched = false;

  while (rest.length > 0) {
    const match = token.exec(rest);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }
    total += parseFloat(match[1]) * UNIT_TO_MS[match[2]];
    rest = rest.slice(match[0].length);
    matched = true;
  }

  if (!matched) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  return total;
}
