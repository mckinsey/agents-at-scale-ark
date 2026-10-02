import { useCallback, useEffect, useRef, useState } from 'react';

import type { ArgoWorkflow } from '@/lib/types/argo-workflow';

import { type WorkflowFilters, workflowsService } from './workflows';

const DEFAULT_PAGE_SIZE = 25;

export function useWorkflows(
  namespace: string,
  filters?: WorkflowFilters,
  pageSize: number = DEFAULT_PAGE_SIZE,
  onPageError?: (error: Error) => void,
) {
  const [workflows, setWorkflows] = useState<ArgoWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);

  // tokenStack[i] holds the continue token needed to fetch page i.
  // tokenStack[0] is always undefined (the first page has no cursor).
  const tokenStackRef = useRef<Array<string | undefined>>([undefined]);

  // Guards against a slow, in-flight request overwriting state after a
  // newer one (a filter/namespace change, or another page navigation) has
  // already superseded it.
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (targetPage: number, options?: { silent?: boolean }) => {
      if (!namespace) {
        setWorkflows([]);
        setError(null);
        setLoading(false);
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setLoading(true);
        const continueToken = tokenStackRef.current[targetPage];
        const result = await workflowsService.list(namespace, filters, {
          limit: pageSize,
          continueToken,
          signal: controller.signal,
        });
        // Defensive guard in addition to the AbortSignal: a test double or a
        // caller that doesn't actually reject on abort could otherwise still
        // let a superseded response overwrite state set by a newer request.
        if (abortControllerRef.current !== controller) {
          return;
        }
        setWorkflows(result.items);
        setHasNext(result.hasMore);
        if (result.continueToken) {
          tokenStackRef.current[targetPage + 1] = result.continueToken;
        }
        setPage(targetPage);
        setError(null);
      } catch (err) {
        // A superseded request was cancelled on purpose, not a failure - its
        // response (if any) is already irrelevant, so don't surface it.
        if ((err as Error).name === 'AbortError') {
          return;
        }
        // A cached continue token pins the list to the resourceVersion
        // snapshot of the page-0 request that started the sequence. Once
        // etcd compacts that snapshot away (~5 min by default), the token
        // is permanently unusable and every page built on top of it 410s -
        // there's no page to recover to, so restart the sequence at page 0
        // instead of leaving the user stuck on a dead end.
        const status = (err as { status?: number }).status;
        if (options?.silent && status === 410) {
          tokenStackRef.current = [undefined];
          onPageError?.(new Error('List changed — back to the first page'));
          fetchPage(0, { silent: true });
          return;
        }
        // A silent (page-navigation) failure keeps the already-loaded page on
        // screen instead of replacing it with a dead-end error state - only
        // the initial/filter-driven load blocks the view on error.
        if (options?.silent) {
          onPageError?.(err as Error);
        } else {
          setError(err as Error);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [namespace, filters, pageSize, onPageError],
  );

  // Filters/namespace narrow what a page shows, so restart at page 0 whenever
  // they change instead of reusing a token stack built for a different query.
  useEffect(() => {
    tokenStackRef.current = [undefined];
    fetchPage(0);
    return () => {
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace, filters, pageSize]);

  const goToNextPage = useCallback(() => {
    if (hasNext) {
      fetchPage(page + 1, { silent: true });
    }
  }, [hasNext, page, fetchPage]);

  const goToPreviousPage = useCallback(() => {
    if (page > 0) {
      fetchPage(page - 1, { silent: true });
    }
  }, [page, fetchPage]);

  // Replaces one item in place (matched by name) instead of re-fetching the
  // page. A re-fetch would replay the page's cached continue token, which is
  // pinned to the resourceVersion snapshot of the original request - that
  // returns stale data immediately and a 410 once etcd compacts it away.
  const updateWorkflowItem = useCallback((updated: ArgoWorkflow) => {
    setWorkflows(prev =>
      prev.map(workflow =>
        workflow.metadata.name === updated.metadata.name ? updated : workflow,
      ),
    );
  }, []);

  return {
    workflows,
    loading,
    error,
    page,
    hasNext,
    hasPrevious: page > 0,
    goToNextPage,
    goToPreviousPage,
    updateWorkflowItem,
    refetch: () => fetchPage(page),
  };
}

export function useWorkflow(
  namespace: string,
  name: string,
  refreshInterval: number = 5000,
) {
  const [workflow, setWorkflow] = useState<ArgoWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!name || !namespace) {
      setWorkflow(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const fetchWorkflow = async () => {
      try {
        const data = await workflowsService.get(namespace, name);
        if (mounted) {
          setWorkflow(data);
          setError(null);
          setLoading(false);

          const isTerminalState =
            data.status?.phase === 'Succeeded' ||
            data.status?.phase === 'Failed' ||
            data.status?.phase === 'Error';

          if (isTerminalState && intervalId) {
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
        const isTerminalState =
          initialData.status?.phase === 'Succeeded' ||
          initialData.status?.phase === 'Failed' ||
          initialData.status?.phase === 'Error';

        if (!isTerminalState) {
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
  }, [name, namespace, refreshInterval]);

  return { workflow, loading, error };
}
