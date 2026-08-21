export async function* asyncGeneratorFrom(
  items: readonly Record<string, unknown>[],
): AsyncGenerator<Record<string, unknown>, void, unknown> {
  for (const item of items) {
    yield item;
  }
}
