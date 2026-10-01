import { useCallback, useEffect, useRef, useState } from 'react';

import type { ArgoWorkflow } from '@/lib/types/argo-workflow';

import {
  type WorkflowFilters,
  type WorkflowLifecycleAction,
  workflowsService,
} from './workflows';

const SHUTDOWN_POLL_INTERVAL_MS = 2000;
const TERMINAL_PHASES = new Set(['Succeeded', 'Failed', 'Error']);

function isShuttingDown(workflow: ArgoWorkflow): boolean {
  return (
    Boolean(workflow.spec?.shutdown) &&
    !TERMINAL_PHASES.has(workflow.status?.phase ?? '')
  );
}

export function useWorkflows(namespace: string, filters?: WorkflowFilters) {
  const [workflows, setWorkflows] = useState<ArgoWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkflows = useCallback(async () => {
    if (!namespace) {
      setWorkflows([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await workflowsService.list(namespace, filters);
      setWorkflows(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [namespace, filters]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const replaceWorkflow = useCallback((updated: ArgoWorkflow) => {
    setWorkflows(current =>
      current.map(workflow =>
        workflow.metadata.name === updated.metadata.name ? updated : workflow,
      ),
    );
  }, []);

  const shuttingDownNames = workflows
    .filter(isShuttingDown)
    .map(workflow => workflow.metadata.name)
    .join(',');

  useEffect(() => {
    if (!namespace || !shuttingDownNames) {
      return;
    }

    const names = shuttingDownNames.split(',');
    const intervalId = setInterval(() => {
      for (const name of names) {
        workflowsService
          .get(namespace, name)
          .then(replaceWorkflow)
          .catch(refreshError => {
            console.error(`Failed to refresh workflow ${name}`, refreshError);
          });
      }
    }, SHUTDOWN_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [namespace, shuttingDownNames, replaceWorkflow]);

  return {
    workflows,
    loading,
    error,
    refetch: fetchWorkflows,
    replaceWorkflow,
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
    async (name: string, action: WorkflowLifecycleAction) => {
      if (inFlightRef.current.has(name)) {
        return;
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
