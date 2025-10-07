export function parseTimeoutToSeconds(value: string): number {
  const match = value.match(/^(\d+)([smh])?$/);
  if (!match) {
    throw new Error('Invalid timeout format. Use format like 30s, 2m, or 1h');
  }
  const num = parseInt(match[1], 10);
  const unit = match[2];

  if (!unit) return num;

  switch (unit) {
    case 's':
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 3600;
    default:
      return num;
  }
}
