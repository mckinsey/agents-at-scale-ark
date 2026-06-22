import yaml from 'js-yaml';

import type { WorkflowTemplate } from '@/lib/services/workflow-templates';

const FENCE_OPEN = /```ya?ml\s*\n/i;

export function extractWorkflowYaml(text: string): string | null {
  if (!text) return null;

  const openMatch = FENCE_OPEN.exec(text);
  if (!openMatch) return null;

  const start = openMatch.index + openMatch[0].length;
  const rest = text.slice(start);

  const closeIndex = rest.indexOf('```');
  const body = closeIndex === -1 ? rest : rest.slice(0, closeIndex);

  const trimmed = body.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isWorkflowTemplate(doc: unknown): doc is WorkflowTemplate {
  if (!doc || typeof doc !== 'object') return false;
  if (!('kind' in doc) || doc.kind !== 'WorkflowTemplate') return false;
  if (!('apiVersion' in doc) || typeof doc.apiVersion !== 'string') return false;
  if (!('metadata' in doc) || !doc.metadata || typeof doc.metadata !== 'object') {
    return false;
  }
  const metadata = doc.metadata;
  return 'name' in metadata && typeof metadata.name === 'string' && metadata.name.length > 0;
}

export function parseWorkflowTemplate(candidate: string): WorkflowTemplate | null {
  let doc: unknown;
  try {
    doc = yaml.load(candidate);
  } catch {
    return null;
  }

  return isWorkflowTemplate(doc) ? doc : null;
}
