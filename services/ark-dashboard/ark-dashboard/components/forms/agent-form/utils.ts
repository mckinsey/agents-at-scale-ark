'use client';

import type { Parameter } from '@/components/ui/parameter-editor';
import type { AgentHeader, AgentOverride } from '@/lib/services';
import { isMcpOverride } from '@/lib/utils/mcp-header-overrides';
import { generateUUID } from '@/lib/utils/uuid';

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

export function agentParametersChanged(
  current: Parameter[],
  initial: Parameter[],
): boolean {
  if (current.length !== initial.length) return true;
  return current.some((param, i) => {
    const original = initial[i];
    return (
      param.name !== original?.name ||
      param.value !== original?.value ||
      param.source !== original?.source ||
      param.queryParameterName !== original?.queryParameterName ||
      param.overrideQueryName !== original?.overrideQueryName
    );
  });
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
        id: generateUUID(),
        name: p.name,
        source: 'queryParameter' as const,
        value: '',
        queryParameterName: queryParamName,
        overrideQueryName: namesDiffer,
      };
    }
    if (p.valueFrom?.configMapKeyRef) {
      return {
        id: generateUUID(),
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
        id: generateUUID(),
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
      id: generateUUID(),
      name: p.name,
      source: 'value' as const,
      value: p.value || '',
      queryParameterName: '',
      overrideQueryName: false,
    };
  });
}

export function transformFormParametersToApi(
  parameters: Parameter[],
): AgentParameterOutput[] {
  return parameters
    .filter(p => p.name)
    .map(p => {
      if (p.source === 'queryParameter') {
        const queryParamName =
          p.overrideQueryName && p.queryParameterName
            ? p.queryParameterName
            : p.name;
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

const MODEL_OVERRIDE_RESOURCE_TYPE = 'model';

function isEditableModelOverride(override: AgentOverride): boolean {
  const selector = override.labelSelector;
  const hasLabelSelector =
    Object.keys(selector?.matchLabels ?? {}).length > 0 ||
    (selector?.matchExpressions?.length ?? 0) > 0;
  return (
    override.resourceType === MODEL_OVERRIDE_RESOURCE_TYPE && !hasLabelSelector
  );
}

export function getModelOverrideHeaders(
  overrides: AgentOverride[] | null | undefined,
): AgentHeader[] {
  return (overrides ?? [])
    .filter(isEditableModelOverride)
    .flatMap(override => override.headers);
}

export function buildAgentOverrides(
  existing: AgentOverride[] | null | undefined,
  modelHeaders: AgentHeader[],
  mcpOverrides?: AgentOverride[],
): AgentOverride[] {
  const preserved = (existing ?? []).filter(
    override =>
      !isEditableModelOverride(override) &&
      !(mcpOverrides && isMcpOverride(override)),
  );
  const modelOverrides: AgentOverride[] =
    modelHeaders.length > 0
      ? [{ resourceType: MODEL_OVERRIDE_RESOURCE_TYPE, headers: modelHeaders }]
      : [];
  return [...modelOverrides, ...(mcpOverrides ?? []), ...preserved];
}
