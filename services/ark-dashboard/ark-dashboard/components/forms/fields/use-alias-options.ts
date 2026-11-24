import { useMemo } from 'react';

export function useAliasOptions(
  items: readonly { readonly name: string }[] | undefined,
  excludeName?: string,
): string[] {
  return useMemo(
    () =>
      (items ?? [])
        .map(item => item.name)
        .filter(name => name !== excludeName)
        .sort((a, b) => a.localeCompare(b)),
    [items, excludeName],
  );
}
