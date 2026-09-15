import yaml from 'js-yaml';

import type { WorkflowParameter } from '@/lib/services/workflow-templates';

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function parseWorkflowParameters(yamlText: string): WorkflowParameter[] {
  if (!yamlText.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText);
  } catch {
    return [];
  }

  const root = toRecord(parsed);
  const spec = toRecord(root?.spec);
  const argumentsRecord = toRecord(spec?.arguments);
  const parameters = argumentsRecord?.parameters;

  if (!Array.isArray(parameters)) {
    return [];
  }

  const result: WorkflowParameter[] = [];
  parameters.forEach(entry => {
    const param = toRecord(entry);
    if (!param || typeof param.name !== 'string') {
      return;
    }
    result.push({
      name: param.name,
      value: typeof param.value === 'string' ? param.value : undefined,
      default: typeof param.default === 'string' ? param.default : undefined,
      description:
        typeof param.description === 'string' ? param.description : undefined,
    });
  });

  return result;
}
