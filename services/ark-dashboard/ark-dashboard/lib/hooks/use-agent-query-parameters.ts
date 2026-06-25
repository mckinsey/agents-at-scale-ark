'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { components } from '@/lib/api/generated/types';
import { agentsService } from '@/lib/services';
import { extractAgentRequiredParams } from '@/lib/utils/query-parameters';

export type ApiQueryParameter = components['schemas']['QueryParameter'];

interface UseAgentQueryParametersResult {
  requiredParameters: string[];
  values: Record<string, string>;
  setValue: (name: string, value: string) => void;
  missingParameters: string[];
  toApiParameters: () => ApiQueryParameter[] | undefined;
}

/**
 * Resolves the query parameters an agent requires (those sourced from
 * query.spec.parameters via valueFrom.queryParameterRef) and holds the values a
 * user supplies for them. Shared by every chat surface so the fetch, the
 * required/missing logic, and the API shaping live in one place.
 */
export function useAgentQueryParameters(
  participantName: string | null | undefined,
  participantType: string | null | undefined,
): UseAgentQueryParametersResult {
  const [requiredParameters, setRequiredParameters] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!participantName || (participantType && participantType !== 'agent')) {
      setRequiredParameters([]);
      setValues({});
      return;
    }
    const targetName = participantName.includes('/')
      ? participantName.split('/').pop() || participantName
      : participantName;
    let cancelled = false;
    agentsService
      .getByName(targetName)
      .then(agent => {
        if (cancelled) return;
        const required = extractAgentRequiredParams(agent?.parameters);
        setRequiredParameters(required);
        setValues(prev => {
          const next: Record<string, string> = {};
          for (const name of required) next[name] = prev[name] || '';
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setRequiredParameters([]);
        setValues({});
      });
    return () => {
      cancelled = true;
    };
  }, [participantName, participantType]);

  const setValue = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  const missingParameters = useMemo(
    () => requiredParameters.filter(name => !values[name]?.trim()),
    [requiredParameters, values],
  );

  const toApiParameters = useCallback((): ApiQueryParameter[] | undefined => {
    if (requiredParameters.length === 0) return undefined;
    return requiredParameters.map(name => ({ name, value: values[name] }));
  }, [requiredParameters, values]);

  return {
    requiredParameters,
    values,
    setValue,
    missingParameters,
    toApiParameters,
  };
}
