export const APP_SCOPED_PARAMS: readonly string[] = ['namespace'];

export function buildScopedPath(
  target: string,
  current: URLSearchParams | null | undefined,
  currentPathname: string | null | undefined,
): string {
  const [pathname, targetQuery] = target.split('?');
  const keepAll = pathname === currentPathname;

  const carried = new URLSearchParams(current?.toString() ?? '');
  const next = new URLSearchParams();

  for (const [key, value] of carried) {
    if (keepAll || APP_SCOPED_PARAMS.includes(key)) {
      next.set(key, value);
    }
  }

  for (const [key, value] of new URLSearchParams(targetQuery ?? '')) {
    next.set(key, value);
  }

  const queryString = next.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}
