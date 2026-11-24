import { describe, expect, it } from 'vitest';

import { validateWorkflowYaml } from '@/lib/utils/validate-workflow-yaml';

const validYaml = [
  'apiVersion: argoproj.io/v1alpha1',
  'kind: WorkflowTemplate',
  'metadata:',
  '  name: placeholder',
  'spec:',
  '  entrypoint: main',
  '  templates:',
  '    - name: main',
].join('\n');

describe('validateWorkflowYaml', () => {
  it('accepts a valid WorkflowTemplate with non-empty templates', () => {
    expect(validateWorkflowYaml(validYaml)).toEqual({ ok: true });
  });

  it('rejects a non-mapping document', () => {
    const result = validateWorkflowYaml('- one\n- two\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('mapping');
    }
  });

  it('rejects a document missing kind: WorkflowTemplate', () => {
    const result = validateWorkflowYaml(
      'apiVersion: v1\nkind: Pod\nspec:\n  templates:\n    - name: main\n',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('WorkflowTemplate');
    }
  });

  it('rejects a WorkflowTemplate with empty templates', () => {
    const result = validateWorkflowYaml(
      'kind: WorkflowTemplate\nspec:\n  templates: []\n',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('templates');
    }
  });

  it('rejects unparseable yaml', () => {
    const result = validateWorkflowYaml('foo: bar: baz');
    expect(result.ok).toBe(false);
  });
});
