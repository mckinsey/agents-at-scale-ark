'use client';

import type { components } from '@/lib/api/generated/types';

type QueryParameterInput = components['schemas']['QueryParameter-Input'];
type QueryParameterOutput = components['schemas']['QueryParameter-Output'];
type AgentParameterOutput = components['schemas']['AgentParameter-Output'];

export interface QueryParameter {
  name: string;
  value: string;
  source?: 'input' | 'agent';
  required?: boolean;
}

export const TEMPLATE_REGEX = /\{\{\s*\.([\w]+)\s*\}\}/g;

export function extractTemplateParameters(text: string): string[] {
  if (!text) return [];

  const params = new Set<string>();
  const matches = text.matchAll(TEMPLATE_REGEX);

  for (const match of matches) {
    if (match[1]) {
      params.add(match[1]);
    }
  }

  return Array.from(params);
}

export function extractAgentRequiredParams(
  agentParams: AgentParameterOutput[] | null | undefined
): string[] {
  if (!agentParams) return [];

  return agentParams
    .filter(p => p.valueFrom?.queryParameterRef?.name)
    .map(p => p.valueFrom!.queryParameterRef!.name);
}

export function transformQueryParametersToApi(
  params: QueryParameter[]
): QueryParameterInput[] {
  return params
    .filter(p => p.name.trim() !== '')
    .map(p => ({
      name: p.name,
      value: p.value || undefined,
    }));
}

export function transformApiToQueryParameters(
  params: QueryParameterOutput[] | null | undefined
): QueryParameter[] {
  if (!params) return [];

  return params.map(p => ({
    name: p.name,
    value: p.value || '',
  }));
}

export function mergeParameters(
  existingParams: QueryParameter[],
  inputParams: string[],
  agentParams: string[]
): QueryParameter[] {
  const result: QueryParameter[] = [...existingParams];
  const existingNames = new Set(existingParams.map(p => p.name));

  for (const name of inputParams) {
    if (!existingNames.has(name)) {
      result.push({ name, value: '', source: 'input' });
      existingNames.add(name);
    }
  }

  for (const name of agentParams) {
    if (!existingNames.has(name)) {
      result.push({ name, value: '', source: 'agent', required: true });
      existingNames.add(name);
    } else {
      const existing = result.find(p => p.name === name);
      if (existing) {
        existing.source = 'agent';
        existing.required = true;
      }
    }
  }

  return result;
}

