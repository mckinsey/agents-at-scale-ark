import type { WorkflowSpec } from '@/lib/services/workflow-templates';

export function countWorkflowTasks(spec: WorkflowSpec | undefined): number {
  if (!spec?.templates) {
    return 0;
  }

  const dagTemplate = spec.templates.find(t => t.dag?.tasks);
  if (dagTemplate?.dag) {
    return dagTemplate.dag.tasks.length;
  }

  const stepsTemplate = spec.templates.find(t => t.steps);
  if (stepsTemplate?.steps) {
    return stepsTemplate.steps.reduce((count, step) => count + step.length, 0);
  }

  if (spec.entrypoint) {
    return 1;
  }

  return 0;
}
