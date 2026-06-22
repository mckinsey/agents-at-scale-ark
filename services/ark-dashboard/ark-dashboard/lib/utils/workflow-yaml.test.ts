import { describe, expect, it } from 'vitest';

import { extractWorkflowYaml, parseWorkflowTemplate } from './workflow-yaml';

const TEMPLATE = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: demo
spec:
  entrypoint: main`;

describe('extractWorkflowYaml', () => {
  it('returns null when there is no fence', () => {
    expect(extractWorkflowYaml('just some prose, no code')).toBeNull();
  });

  it('extracts a complete fenced block', () => {
    const text = `Here you go:\n\n\`\`\`yaml\n${TEMPLATE}\n\`\`\`\n`;
    expect(extractWorkflowYaml(text)).toBe(TEMPLATE);
  });

  it('tolerates a missing closing fence (mid-stream)', () => {
    const text = `Sure:\n\n\`\`\`yaml\n${TEMPLATE}`;
    expect(extractWorkflowYaml(text)).toBe(TEMPLATE);
  });

  it('returns the first fence when multiple are present', () => {
    const text = `\`\`\`yaml\n${TEMPLATE}\n\`\`\`\n\nand also:\n\n\`\`\`yaml\nkind: Other\n\`\`\``;
    expect(extractWorkflowYaml(text)).toBe(TEMPLATE);
  });

  it('returns null for an empty fence', () => {
    expect(extractWorkflowYaml('```yaml\n\n```')).toBeNull();
  });
});

describe('parseWorkflowTemplate', () => {
  it('parses a valid WorkflowTemplate', () => {
    const parsed = parseWorkflowTemplate(TEMPLATE);
    expect(parsed?.metadata?.name).toBe('demo');
  });

  it('rejects malformed YAML', () => {
    expect(parseWorkflowTemplate('key: : : value')).toBeNull();
  });

  it('rejects YAML whose kind is not WorkflowTemplate', () => {
    expect(parseWorkflowTemplate('kind: Workflow\nmetadata:\n  name: x')).toBeNull();
  });

  it('rejects a scalar document', () => {
    expect(parseWorkflowTemplate('just a string')).toBeNull();
  });
});
