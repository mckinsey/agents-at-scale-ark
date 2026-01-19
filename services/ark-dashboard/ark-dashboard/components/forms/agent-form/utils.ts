'use client';

import type { Parameter } from '@/components/ui/parameter-editor';

interface AgentParameterInput {
  name: string;
  value?: string | null;
  valueFrom?: {
    queryParameterRef?: { name: string } | null;
    configMapKeyRef?: { name: string; key: string } | null;
    secretKeyRef?: { name: string; key: string } | null;
  } | null;
}

interface AgentParameterOutput {
  name: string;
  value?: string;
  valueFrom?: {
    queryParameterRef?: { name: string };
    configMapKeyRef?: { name: string; key: string };
    secretKeyRef?: { name: string; key: string };
  };
}

export function transformAgentParametersToForm(
  agentParameters: AgentParameterInput[] | null | undefined,
): Parameter[] {
  if (!agentParameters) return [];

  return agentParameters.map(p => {
    if (p.valueFrom?.queryParameterRef) {
      const queryParamName = p.valueFrom.queryParameterRef.name;
      const namesDiffer = queryParamName !== p.name;
      return {
        name: p.name,
        source: 'queryParameter' as const,
        value: '',
        queryParameterName: queryParamName,
        overrideQueryName: namesDiffer,
      };
    }
    if (p.valueFrom?.configMapKeyRef) {
      return {
        name: p.name,
        source: 'configMapKeyRef' as const,
        value: '',
        queryParameterName: '',
        overrideQueryName: false,
        configMapRef: {
          name: p.valueFrom.configMapKeyRef.name,
          key: p.valueFrom.configMapKeyRef.key,
        },
      };
    }
    if (p.valueFrom?.secretKeyRef) {
      return {
        name: p.name,
        source: 'secretKeyRef' as const,
        value: '',
        queryParameterName: '',
        overrideQueryName: false,
        secretRef: {
          name: p.valueFrom.secretKeyRef.name,
          key: p.valueFrom.secretKeyRef.key,
        },
      };
    }
    return {
      name: p.name,
      source: 'value' as const,
      value: p.value || '',
      queryParameterName: '',
      overrideQueryName: false,
    };
  });
}

export function transformFormParametersToApi(parameters: Parameter[]): AgentParameterOutput[] {
  return parameters
    .filter(p => p.name)
    .map(p => {
      if (p.source === 'queryParameter') {
        const queryParamName =
          p.overrideQueryName && p.queryParameterName ? p.queryParameterName : p.name;
        return {
          name: p.name,
          valueFrom: {
            queryParameterRef: { name: queryParamName },
          },
        };
      }
      if (p.source === 'configMapKeyRef' && p.configMapRef) {
        return {
          name: p.name,
          valueFrom: {
            configMapKeyRef: {
              name: p.configMapRef.name,
              key: p.configMapRef.key,
            },
          },
        };
      }
      if (p.source === 'secretKeyRef' && p.secretRef) {
        return {
          name: p.name,
          valueFrom: {
            secretKeyRef: {
              name: p.secretRef.name,
              key: p.secretRef.key,
            },
          },
        };
      }
      return { name: p.name, value: p.value || undefined };
    });
}

