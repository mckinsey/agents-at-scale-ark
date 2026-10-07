'use client';

import { useAtomValue } from 'jotai';

import { lastListUrlAtom } from '@/atoms/navigation-history';

/**
 * Resolves a list route to the URL that list was last left in - its filters,
 * sorting and page - or to the bare route when it has not been visited since
 * the page was loaded, so a back control never invents state.
 *
 * Every back control on a detail, studio or form screen must resolve through
 * this. A raw `listHref` returns the user to an unfiltered page one, which is
 * the behaviour this replaced.
 */
export function useListReturnHref(listHref: string): string {
  const lastListUrl = useAtomValue(lastListUrlAtom);
  return lastListUrl[listHref] ?? listHref;
}
