'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const SEARCH_DEBOUNCE_MS = 400;

export interface UrlParamSpec {
  readonly default: unknown;
  readonly parse?: (raw: string) => unknown;
  /** Delay before this key reaches the URL. Omit for an immediate write. */
  readonly debounceMs?: number;
}

export type UrlStateSpec = Readonly<Record<string, UrlParamSpec>>;

export type UrlStateValues<TSpec extends UrlStateSpec> = {
  [TKey in keyof TSpec]: TSpec[TKey] extends {
    parse: (raw: string) => infer TParsed;
  }
    ? TParsed
    : TSpec[TKey]['default'];
};

export interface UrlStateOptions {
  readonly pageKey?: string;
}

export interface UrlStateSetOptions {
  /** Write now, bypassing any `debounceMs` on the keys being set. */
  readonly flush?: boolean;
}

interface Draft {
  readonly value: unknown;
  readonly baseRaw: string | null;
}

type Drafts = Readonly<Record<string, Draft>>;

const DEFAULT_PAGE_KEY = 'page';
const NO_DRAFTS: Drafts = {};

interface PendingParams {
  landed: string;
  pending: string;
}

/**
 * The query string each screen will hold once every write issued against it has
 * landed, keyed by pathname. Shared between instances on purpose: a screen may
 * mount more than one `useUrlState` - a page's own spec plus a sort key inside a
 * child - and those are two writers to one URL. A per-instance accumulator lets
 * the second write build on a base that predates the first and drop it.
 */
const pendingParamsByPath = new Map<string, PendingParams>();

/** Live instances per pathname, so the entry above can be dropped with them. */
const instanceCountByPath = new Map<string, number>();

function retainPath(pathname: string): void {
  instanceCountByPath.set(pathname, (instanceCountByPath.get(pathname) ?? 0) + 1);
}

function releasePath(pathname: string): void {
  const remaining = (instanceCountByPath.get(pathname) ?? 1) - 1;
  if (remaining > 0) {
    instanceCountByPath.set(pathname, remaining);
    return;
  }
  // Nothing is left to build on it. Keeping it would hand a screen revisited at
  // the same query string a base that never landed.
  instanceCountByPath.delete(pathname);
  pendingParamsByPath.delete(pathname);
}

/** Rebases on the landed URL once per change, however many instances render. */
function syncPendingParams(pathname: string, landed: string): void {
  const entry = pendingParamsByPath.get(pathname);
  if (!entry || entry.landed !== landed) {
    pendingParamsByPath.set(pathname, { landed, pending: landed });
  }
}

function readPendingParams(pathname: string, landed: string): string {
  return pendingParamsByPath.get(pathname)?.pending ?? landed;
}

function writePendingParams(
  pathname: string,
  landed: string,
  pending: string,
): void {
  const entry = pendingParamsByPath.get(pathname);
  if (entry) {
    entry.pending = pending;
    return;
  }
  pendingParamsByPath.set(pathname, { landed, pending });
}

/**
 * Drops the accumulator. Tests only: without it one test's unlanded write is the
 * next test's base.
 */
export function resetPendingParams(): void {
  pendingParamsByPath.clear();
  instanceCountByPath.clear();
}

function readParam(spec: UrlParamSpec, raw: string | null): unknown {
  if (raw === null || raw === '') {
    return spec.default;
  }
  return spec.parse ? spec.parse(raw) : raw;
}

function writeParam(
  params: URLSearchParams,
  key: string,
  spec: UrlParamSpec,
  value: unknown,
): void {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === spec.default
  ) {
    params.delete(key);
    return;
  }
  params.set(key, String(value));
}

function retainLiveDrafts(drafts: Drafts, params: URLSearchParams): Drafts {
  const keys = Object.keys(drafts);
  if (keys.length === 0) {
    return drafts;
  }

  const live: Record<string, Draft> = {};
  let dropped = false;
  for (const key of keys) {
    if (params.get(key) === drafts[key].baseRaw) {
      live[key] = drafts[key];
    } else {
      dropped = true;
    }
  }
  return dropped ? live : drafts;
}

/**
 * Binds a screen's filters, sorting and pagination to the query string.
 *
 * The URL is the single source of truth: a key declared here must not also be
 * mirrored in local `useState`, or a stale mirror will be written back over a
 * URL the user changed (back/forward, a namespace switch, another writer).
 *
 * A key with `debounceMs` keeps a draft until its delay elapses, so an input
 * bound to it stays responsive while the URL updates at most once per pause.
 * A draft is discarded as soon as the URL's value for that key moves away from
 * what the draft was based on, so the URL always wins.
 *
 * Returns `[values, setValues, committedValues]`:
 * - `values` — draft where one is live, else the URL. Bind inputs and
 *   in-memory filtering to this.
 * - `setValues(updates, { flush })` — writes are accumulated across calls and
 *   across instances on the same screen, so they compose into a single
 *   navigation instead of overwriting each other. A write that moves any key
 *   other than the page key resets the page, even when that key is a draft
 *   carried along by an explicit page change.
 * - `committedValues` — the URL only, never a draft. Use this to key a server
 *   query so it refetches once per pause rather than once per keystroke.
 */
export function useUrlState<TSpec extends UrlStateSpec>(
  spec: TSpec,
  options?: UrlStateOptions,
): readonly [
  UrlStateValues<TSpec>,
  (
    updates: Partial<UrlStateValues<TSpec>>,
    setOptions?: UrlStateSetOptions,
  ) => void,
  UrlStateValues<TSpec>,
] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageKey = options?.pageKey ?? DEFAULT_PAGE_KEY;

  const specRef = useRef(spec);
  specRef.current = spec;
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  // The query string as it will be once every write issued so far has landed.
  // `searchParams` lags a write by a render, so reading it per call would make
  // two writes in one commit build on the same stale base and lose the first.
  syncPendingParams(pathname, searchParams.toString());

  const [drafts, setDrafts] = useState<Drafts>(NO_DRAFTS);
  const liveDrafts = retainLiveDrafts(drafts, searchParams);
  const draftsRef = useRef(liveDrafts);
  draftsRef.current = liveDrafts;

  useEffect(() => {
    if (liveDrafts !== drafts) {
      setDrafts(liveDrafts);
    }
  }, [liveDrafts, drafts]);

  useEffect(() => {
    retainPath(pathname);
    return () => releasePath(pathname);
  }, [pathname]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const specSignature = useMemo(
    () =>
      Object.keys(spec)
        .map(key => `${key}=${String(spec[key].default)}`)
        .join('&'),
    [spec],
  );

  const committedValues = useMemo(() => {
    const current = specRef.current;
    const parsed: Record<string, unknown> = {};
    for (const key of Object.keys(current)) {
      parsed[key] = readParam(current[key], searchParams.get(key));
    }
    return parsed as UrlStateValues<TSpec>;
    // specSignature is read through specRef, so the rule cannot see it. It must
    // stay: it is what makes a default supplied by a prop recompute, while a
    // spec object rebuilt unchanged on every render does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, specSignature]);

  const values = useMemo(() => {
    const keys = Object.keys(liveDrafts);
    if (keys.length === 0) {
      return committedValues;
    }
    const merged: Record<string, unknown> = { ...committedValues };
    for (const key of keys) {
      merged[key] = liveDrafts[key].value;
    }
    return merged as UrlStateValues<TSpec>;
  }, [committedValues, liveDrafts]);

  const commit = useCallback(
    (updates: Record<string, unknown>) => {
      const current = specRef.current;
      const base = readPendingParams(
        pathname,
        searchParamsRef.current.toString(),
      );
      const params = new URLSearchParams(base);
      const keys = Object.keys(updates).filter(key => current[key]);
      if (keys.length === 0) {
        return;
      }

      for (const key of keys) {
        writeParam(params, key, current[key], updates[key]);
      }

      // Any key but the page moving resets the page, including one carried in
      // from a draft, so a filter cannot land while the page stays behind.
      const resetsPage = current[pageKey] && keys.some(key => key !== pageKey);
      if (resetsPage) {
        writeParam(params, pageKey, current[pageKey], current[pageKey].default);
      }

      const queryString = params.toString();
      if (queryString === base) {
        return;
      }

      writePendingParams(pathname, base, queryString);
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pageKey, pathname, router],
  );

  const flushDrafts = useCallback(() => {
    timerRef.current = null;
    const pending = retainLiveDrafts(
      draftsRef.current,
      searchParamsRef.current,
    );
    const keys = Object.keys(pending);
    if (keys.length === 0) {
      return;
    }

    const updates: Record<string, unknown> = {};
    for (const key of keys) {
      updates[key] = pending[key].value;
    }
    commit(updates);
  }, [commit]);

  const flushDraftsRef = useRef(flushDrafts);
  flushDraftsRef.current = flushDrafts;

  const setValues = useCallback(
    (
      updates: Partial<UrlStateValues<TSpec>>,
      setOptions?: UrlStateSetOptions,
    ) => {
      const current = specRef.current;
      const immediate: Record<string, unknown> = {};
      const deferred: Record<string, unknown> = {};
      let hasImmediate = false;
      let hasDeferred = false;

      for (const key of Object.keys(updates)) {
        const paramSpec = current[key];
        if (!paramSpec) {
          continue;
        }
        if (!setOptions?.flush && paramSpec.debounceMs) {
          deferred[key] = updates[key];
          hasDeferred = true;
        } else {
          immediate[key] = updates[key];
          hasImmediate = true;
        }
      }

      if (hasImmediate) {
        // An immediate write carries any draft still in flight, so the URL
        // never contradicts what the screen is already showing.
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        const pending = draftsRef.current;
        const merged: Record<string, unknown> = {};
        for (const key of Object.keys(pending)) {
          merged[key] = pending[key].value;
        }
        Object.assign(merged, immediate);
        if (Object.keys(pending).length > 0) {
          draftsRef.current = NO_DRAFTS;
          setDrafts(NO_DRAFTS);
        }
        commit(merged);
      }

      if (hasDeferred) {
        const base = new URLSearchParams(
          readPendingParams(pathname, searchParamsRef.current.toString()),
        );
        const keys = Object.keys(deferred);
        const next: Record<string, Draft> = { ...draftsRef.current };
        for (const key of keys) {
          next[key] = { value: deferred[key], baseRaw: base.get(key) };
        }
        draftsRef.current = next;
        setDrafts(next);

        const delay = Math.max(
          ...keys.map(key => current[key].debounceMs ?? SEARCH_DEBOUNCE_MS),
        );
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => flushDraftsRef.current(), delay);
      }
    },
    [commit, pathname],
  );

  return [values, setValues, committedValues] as const;
}
