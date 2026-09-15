import { describe, expect, it } from 'vitest';

import { renderWorkflowDagSvg } from '@/lib/utils/workflow-dag-svg';

const dagYaml = [
  'apiVersion: argoproj.io/v1alpha1',
  'kind: WorkflowTemplate',
  'metadata:',
  '  name: dag-workflow',
  'spec:',
  '  entrypoint: main',
  '  templates:',
  '    - name: main',
  '      dag:',
  '        tasks:',
  '          - name: task-a',
  '            template: task-a-template',
  '          - name: task-b',
  '            template: task-b-template',
  '            dependencies: [task-a]',
].join('\n');

describe('renderWorkflowDagSvg', () => {
  it('renders an SVG with a node per task', () => {
    const svg = renderWorkflowDagSvg(dagYaml);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('task-a.task-a-template');
    expect(svg).toContain('task-b.task-b-template');
    const rectCount = (svg?.match(/<rect /g) ?? []).length;
    expect(rectCount).toBeGreaterThanOrEqual(2);
  });

  it('draws an edge with an arrow marker for dependencies', () => {
    const svg = renderWorkflowDagSvg(dagYaml);
    expect(svg).toContain('marker-end="url(#arrow)"');
    expect(svg).toContain('<marker id="arrow"');
  });

  it('escapes special characters in task names', () => {
    const svg = renderWorkflowDagSvg(dagYaml);
    expect(svg).not.toBeNull();
    expect(svg).not.toContain('<text>&');
  });

  it('returns null when the manifest has no templates', () => {
    const yaml = [
      'apiVersion: argoproj.io/v1alpha1',
      'kind: WorkflowTemplate',
      'spec:',
      '  entrypoint: main',
    ].join('\n');
    expect(renderWorkflowDagSvg(yaml)).toBeNull();
  });

  it('returns null for invalid YAML', () => {
    expect(renderWorkflowDagSvg('::: not yaml :::')).toBeNull();
  });
});
