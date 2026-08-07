import { describe, expect, it } from 'vitest';

import { extractWorkflowYaml } from '@/lib/utils/extract-workflow-yaml';

describe('extractWorkflowYaml', () => {
  it('should extract a single yaml fenced block', () => {
    const message = [
      'Here is your template:',
      '```yaml',
      'apiVersion: argoproj.io/v1alpha1',
      'kind: WorkflowTemplate',
      'metadata:',
      '  name: my-template',
      '```',
    ].join('\n');

    const result = extractWorkflowYaml(message);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('kind: WorkflowTemplate');
      expect(result.yaml).toContain('name: my-template');
    }
  });

  it('should take the LAST yaml block when multiple are present', () => {
    const message = [
      '```yaml',
      'kind: WorkflowTemplate',
      'metadata:',
      '  name: first',
      '```',
      'and the updated version:',
      '```yaml',
      'kind: WorkflowTemplate',
      'metadata:',
      '  name: second',
      '```',
    ].join('\n');

    const result = extractWorkflowYaml(message);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('name: second');
      expect(result.yaml).not.toContain('name: first');
    }
  });

  it('should handle surrounding prose and CRLF line endings', () => {
    const message =
      'Some intro prose.\r\n\r\n```yaml\r\nkind: WorkflowTemplate\r\nmetadata:\r\n  name: crlf-template\r\n```\r\n\r\nSome closing prose.';

    const result = extractWorkflowYaml(message);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('name: crlf-template');
      expect(result.yaml).not.toContain('\r');
    }
  });

  it('should return invalid for malformed yaml in a yaml block', () => {
    const message = ['```yaml', 'kind: WorkflowTemplate', '  bad: : broken', '```'].join(
      '\n',
    );

    const result = extractWorkflowYaml(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
  });

  it('should return invalid for a yaml block that is not a mapping', () => {
    const message = ['```yaml', '- item-one', '- item-two', '```'].join('\n');

    const result = extractWorkflowYaml(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
  });

  it('should return none when there is no fenced block', () => {
    const result = extractWorkflowYaml('Just some prose with no code blocks.');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('none');
    }
  });

  it('should return none for a generic fence even when it parses as a mapping with kind', () => {
    const message = [
      'No language tag here:',
      '```',
      'kind: WorkflowTemplate',
      'metadata:',
      '  name: generic',
      '```',
    ].join('\n');

    const result = extractWorkflowYaml(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('none');
    }
  });

  it('should return none for a generic fence without a kind mapping', () => {
    const message = ['```', 'just some text', 'no kind here', '```'].join('\n');

    const result = extractWorkflowYaml(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('none');
    }
  });

  it('should return none when a reply quotes prose only, leaving the template untouched', () => {
    const message = [
      'I looked at the current template and it already does what you asked,',
      'so I am not changing anything.',
    ].join('\n');

    const result = extractWorkflowYaml(message);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('none');
    }
  });
});
