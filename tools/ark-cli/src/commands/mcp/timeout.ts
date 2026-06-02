export function parseTimeoutDuration(input: string): number {
  const match = input.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) {
    throw new Error(
      `invalid --timeout value: ${input} (expected Go duration such as 60s, 5m, 1h)`
    );
  }
  const value = parseFloat(match[1]);
  if (!isFinite(value) || value <= 0) {
    throw new Error(
      `invalid --timeout value: ${input} (must be a positive duration)`
    );
  }
  const unit = match[2];
  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`invalid --timeout unit: ${unit}`);
  }
}
