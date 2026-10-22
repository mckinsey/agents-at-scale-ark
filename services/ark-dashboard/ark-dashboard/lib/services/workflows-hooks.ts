import { useCallback, useEffect, useRef, useState } from 'react';

import type { ArgoWorkflow } from '@/lib/types/argo-workflow';

import { isTerminalPhase } from './workflow-mapper';
import {
  type WorkflowFilters,
  type WorkflowLifecycleAction,
  type WorkflowPage,
  workflowsService,
} from './workflows';

const SHUTDOWN_POLL_INTERVAL_MS = 2000;
const WATCH_POLL_INTERVAL_MS = 5000;

function isShuttingDown(workflow: ArgoWorkflow): boolean {
  return (
    Boolean(workflow.spec?.shutdown) && !isTerminalPhase(workflow.status?.phase)
  );
}

function usePollWorkflows(
  namespace: string,
  joinedNames: string,
  intervalMs: number,
  onUpdate: (workflow: ArgoWorkflow) => void,
) {
  useEffect(() => {
    if (!namespace || !joinedNames) {
      return;
    }

    const names = joinedNames.split(',');
    const intervalId = setInterval(() => {
      for (const name of names) {
        workflowsService
          .get(namespace, name)
          .then(onUpdate)
          .catch(refreshError => {
            console.error(`Failed to refresh workflow ${name}`, refreshError);
          });
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [namespace, joinedNames, intervalMs, onUpdate]);
}

const DEFAULT_PAGE_SIZE = 25;
const OFFSET_TOKEN_PATTERN = /^\d+$/;
const UNREACHABLE_PAGE_STATUSES = new Set([400, 410]);

function computeTotalCount(offset: number, page: WorkflowPage): number | null {
  if (page.remainingItemCount === undefined) {
    return null;
  }
  return offset + page.items.length + page.remainingItemCount;
}

function resolveContinueToken(
  targetPage: number,
  pageSize: number,
  offsetPaging: boolean | null,
  tokenStack: Array<string | undefined>,
): string | undefined {
  if (targetPage === 0) {
    return undefined;
  }
  if (offsetPaging === false) {
    return tokenStack[targetPage];
  }
  return String(targetPage * pageSize);
}

function withPinnedFirst(
  items: ArgoWorkflow[],
  pinned: ArgoWorkflow | null,
): ArgoWorkflow[] {
  if (!pinned) {
    return items;
  }
  return [
    pinned,
    ...items.filter(item => item.metadata.name !== pinned.metadata.name),
  ];
}

function isUnreachablePage(err: unknown, targetPage: number): boolean {
  if (targetPage === 0) {
    return false;
  }
  const status = (err as { status?: number }).status;
  return status !== undefined && UNREACHABLE_PAGE_STATUSES.has(status);
}

function isOffsetPaging(page: WorkflowPage): boolean {
  if (page.continueToken !== undefined) {
    return OFFSET_TOKEN_PATTERN.test(page.continueToken);
  }
  return page.remainingItemCount !== undefined;
}

export interface UseWorkflowsOptions {
  page?: number;
  pageSize?: number;
  onPageError?: (error: Error) => void;
  onPageReset?: () => void;
}

export function useWorkflows(
  namespace: string,
  filters?: WorkflowFilters,
  {
    page = 0,
    pageSize = DEFAULT_PAGE_SIZE,
    onPageError,
    onPageReset,
  }: UseWorkflowsOptions = {},
) {
  const [workflows, setWorkflows] = useState<ArgoWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // tokenStack[i] holds the continue token needed to fetch page i.
  // tokenStack[0] is always undefined (the first page has no cursor).
  const tokenStackRef = useRef<Array<string | undefined>>([undefined]);

  const offsetPagingRef = useRef<boolean | null>(null);

  // Lets a newer fetch cancel a stale in-flight one.
  const abortControllerRef = useRef<AbortController | null>(null);

  const pinnedWorkflowRef = useRef<ArgoWorkflow | null>(null);

  const namespaceRef = useRef(namespace);
  useEffect(() => {
    namespaceRef.current = namespace;
  }, [namespace]);

  const handleFetchError = useCallback(
    (err: unknown, targetPage: number, silent?: boolean) => {
      // Cancelled on purpose, not a failure.
      if ((err as Error).name === 'AbortError') {
        return;
      }
      // A cached token's snapshot gets compacted by etcd after ~5 min, and a
      // deep-linked page cannot be reached with cursors - recover instead of dead-ending.
      if (isUnreachablePage(err, targetPage)) {
        tokenStackRef.current = [undefined];
        onPageError?.(new Error('List changed — back to the first page'));
        onPageReset?.();
        return;
      }
      if (silent) {
        onPageError?.(err as Error);
      } else {
        setError(err as Error);
      }
    },
    [onPageError, onPageReset],
  );

  const fetchPage = useCallback(
    async (targetPage: number, options?: { silent?: boolean }) => {
      if (!namespace) {
        setWorkflows([]);
        setTotalCount(null);
        setError(null);
        setLoading(false);
        return;
      }

      const continueToken = resolveContinueToken(
        targetPage,
        pageSize,
        offsetPagingRef.current,
        tokenStackRef.current,
      );
      if (targetPage > 0 && continueToken === undefined) {
        onPageReset?.();
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setLoading(true);
        const result = await workflowsService.list(namespace, filters, {
          limit: pageSize,
          continueToken,
          signal: controller.signal,
        });
        // Belt-and-suspenders: drop a stale response even if it didn't reject on abort.
        if (abortControllerRef.current !== controller) {
          return;
        }
        offsetPagingRef.current = isOffsetPaging(result);
        const pinned = pinnedWorkflowRef.current;
        pinnedWorkflowRef.current = null;
        setWorkflows(
          withPinnedFirst(result.items, targetPage === 0 ? pinned : null),
        );
        setHasNext(result.hasMore);
        setTotalCount(computeTotalCount(targetPage * pageSize, result));
        if (result.continueToken) {
          tokenStackRef.current[targetPage + 1] = result.continueToken;
        }
        setError(null);
      } catch (err) {
        handleFetchError(err, targetPage, options?.silent);
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [namespace, filters, pageSize, onPageReset, handleFetchError],
  );

  // Filters/namespace narrow what a page shows, so a token stack built for a
  // different query is dropped before the requested page is loaded.
  const queryKey = `${namespace}|${JSON.stringify(filters ?? {})}|${pageSize}`;
  const lastQueryKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastQueryKeyRef.current !== queryKey) {
      lastQueryKeyRef.current = queryKey;
      tokenStackRef.current = [undefined];
      offsetPagingRef.current = null;
    }
    fetchPage(page, { silent: page > 0 });
    return () => {
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, page]);

  // Patches one item in place - avoids re-fetching with a stale cached token.
  const updateWorkflowItem = useCallback((updated: ArgoWorkflow) => {
    setWorkflows(prev =>
      prev.map(workflow =>
        workflow.metadata.name === updated.metadata.name &&
        workflow.metadata.namespace === updated.metadata.namespace
          ? updated
          : workflow,
      ),
    );
  }, []);

  const showCreatedWorkflow = useCallback(
    (created: ArgoWorkflow): boolean => {
      if (created.metadata.namespace !== namespaceRef.current) {
        return false;
      }
      setWorkflows(current => [
        created,
        ...current.filter(
          workflow => workflow.metadata.name !== created.metadata.name,
        ),
      ]);
      pinnedWorkflowRef.current = created;
      tokenStackRef.current = [undefined];
      if (page > 0) {
        onPageReset?.();
      } else {
        fetchPage(0, { silent: true });
      }
      return true;
    },
    [fetchPage, page, onPageReset],
  );

  const [watchedNames, setWatchedNames] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const watchWorkflow = useCallback((name: string) => {
    setWatchedNames(current =>
      current.has(name) ? current : new Set(current).add(name),
    );
  }, []);

  const shuttingDownNames = workflows
    .filter(isShuttingDown)
    .map(workflow => workflow.metadata.name)
    .join(',');

  const watchedActiveNames = workflows
    .filter(
      workflow =>
        watchedNames.has(workflow.metadata.name) &&
        !isTerminalPhase(workflow.status?.phase) &&
        !isShuttingDown(workflow),
    )
    .map(workflow => workflow.metadata.name)
    .join(',');

  usePollWorkflows(
    namespace,
    shuttingDownNames,
    SHUTDOWN_POLL_INTERVAL_MS,
    updateWorkflowItem,
  );
  usePollWorkflows(
    namespace,
    watchedActiveNames,
    WATCH_POLL_INTERVAL_MS,
    updateWorkflowItem,
  );

  return {
    workflows,
    loading,
    error,
    hasNext,
    totalCount,
    updateWorkflowItem,
    showCreatedWorkflow,
    watchWorkflow,
    refetch: () => fetchPage(page),
  };
}

export function useWorkflowLifecycleActions(
  namespace: string,
  onWorkflowUpdated: (workflow: ArgoWorkflow) => void,
) {
  const [pendingNames, setPendingNames] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const inFlightRef = useRef(new Set<string>());

  const runAction = useCallback(
    async (
      name: string,
      action: WorkflowLifecycleAction,
    ): Promise<ArgoWorkflow | undefined> => {
      if (inFlightRef.current.has(name)) {
        return undefined;
      }

      inFlightRef.current.add(name);
      setPendingNames(new Set(inFlightRef.current));

      try {
        const updated = await workflowsService.runLifecycleAction(
          namespace,
          name,
          action,
        );
        onWorkflowUpdated(updated);
        return updated;
      } finally {
        inFlightRef.current.delete(name);
        setPendingNames(new Set(inFlightRef.current));
      }
    },
    [namespace, onWorkflowUpdated],
  );

  const isPending = useCallback(
    (name: string) => pendingNames.has(name),
    [pendingNames],
  );

  return { runAction, isPending };
}

export function useWorkflow(
  namespace: string,
  name: string,
  refreshInterval: number = 5000,
  refreshKey: number = 0,
) {
  const [workflow, setWorkflow] = useState<ArgoWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // A terminal workflow's nodes never change again, so once fetched there is
  // no reason to re-download and re-decompress them just because the user
  // switched to another run and back. Keyed by namespace/name; lives only
  // for this hook instance (cleared on unmount), which matches "while
  // browsing this page" rather than persisting across navigations.
  const cacheRef = useRef<Map<string, ArgoWorkflow>>(new Map());

  // refreshKey is bumped to force a re-fetch of the *currently selected*
  // workflow (e.g. after a lifecycle action like retry) - that must bypass
  // the cache even though the name didn't change. A plain selection switch
  // (name changes, refreshKey doesn't) is free to use the cache.
  const prevRefreshKeyRef = useRef(refreshKey);

  useEffect(() => {
    const forceRefresh = prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;

    if (!name || !namespace) {
      setWorkflow(null);
      setLoading(false);
      return;
    }

    const cacheKey = `${namespace}/${name}`;
    const cached = cacheRef.current.get(cacheKey);
    if (!forceRefresh && cached && isTerminalPhase(cached.status?.phase)) {
      setWorkflow(cached);
      setError(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const fetchWorkflow = async () => {
      try {
        const data = await workflowsService.get(namespace, name);
        if (mounted) {
          cacheRef.current.set(cacheKey, data);
          setWorkflow(data);
          setError(null);
          setLoading(false);

          if (isTerminalPhase(data.status?.phase) && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }

          return data;
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setLoading(false);
        }
      }
      return null;
    };

    const init = async () => {
      const initialData = await fetchWorkflow();

      if (mounted && initialData) {
        if (!isTerminalPhase(initialData.status?.phase)) {
          intervalId = setInterval(fetchWorkflow, refreshInterval);
        }
      }
    };

    init();

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, [name, namespace, refreshInterval, refreshKey]);

  return { workflow, loading, error };
}
