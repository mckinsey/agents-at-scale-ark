import yaml from 'js-yaml';

export type ValidateWorkflowYamlResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateWorkflowYaml(
  source: string,
): ValidateWorkflowYamlResult {
  let parsed: unknown;
  try {
    parsed = yaml.load(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'Expected a WorkflowTemplate mapping.' };
  }

  const resource = parsed as Record<string, unknown>;

  if (resource.kind !== 'WorkflowTemplate') {
    return { ok: false, message: 'Missing "kind: WorkflowTemplate".' };
  }

  const spec = resource.spec;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, message: 'Missing "spec" mapping.' };
  }

  const templates = (spec as Record<string, unknown>).templates;
  if (!Array.isArray(templates) || templates.length === 0) {
    return { ok: false, message: 'Missing a non-empty "spec.templates".' };
  }

  return { ok: true };
}
