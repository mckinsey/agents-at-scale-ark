const NEW_SESSION_PARAMS = ['participant', 'type', 'conversationId'] as const;

export function hasNewSessionParams(
  searchParams: URLSearchParams | null | undefined,
): boolean {
  if (!searchParams) return false;
  return NEW_SESSION_PARAMS.some(key => searchParams.has(key));
}

export function buildUrlWithoutNewSessionParams(
  searchParams: URLSearchParams | null | undefined,
  pathname: string,
): string {
  const params = new URLSearchParams(searchParams?.toString() ?? '');
  for (const key of NEW_SESSION_PARAMS) {
    params.delete(key);
  }
  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}
