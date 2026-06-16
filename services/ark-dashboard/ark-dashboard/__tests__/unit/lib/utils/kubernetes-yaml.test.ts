import { describe, it, expect } from 'vitest';
import { cleanKubernetesResource, toKubernetesYaml } from '@/lib/utils/kubernetes-yaml';

describe('cleanKubernetesResource', () => {
  it('should strip runtime fields from metadata', () => {
    const resource = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: {
        name: 'my-agent',
        namespace: 'default',
        creationTimestamp: '2024-01-01T00:00:00Z',
        resourceVersion: '12345',
        uid: 'abc-123',
        generation: 2,
        selfLink: '/apis/ark.mckinsey.com/v1alpha1/agents/my-agent',
        deletionTimestamp: '2024-06-01T00:00:00Z',
        managedFields: [{ manager: 'kubectl' }],
        labels: { app: 'test' },
        annotations: { 'note': 'hello' },
      },
      spec: { description: 'Test agent' },
      status: { phase: 'Ready' },
    };

    const result = cleanKubernetesResource(resource);

    expect(result).toEqual({
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: {
        name: 'my-agent',
        namespace: 'default',
        labels: { app: 'test' },
        annotations: { note: 'hello' },
      },
      spec: { description: 'Test agent' },
    });
  });

  it('should strip status field', () => {
    const resource = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: { name: 'my-agent' },
      spec: { prompt: 'hello' },
      status: { phase: 'Ready', message: 'All good' },
    };

    const result = cleanKubernetesResource(resource);
    expect(result).not.toHaveProperty('status');
  });

  it('should recursively remove null and undefined values', () => {
    const resource = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: { name: 'my-agent' },
      spec: {
        description: null,
        prompt: 'hello',
        modelRef: {
          name: 'gpt-4',
          namespace: null,
        },
        tools: null,
      },
    };

    const result = cleanKubernetesResource(resource);
    expect(result).toEqual({
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: { name: 'my-agent' },
      spec: {
        prompt: 'hello',
        modelRef: { name: 'gpt-4' },
      },
    });
  });

  it('should remove empty strings, arrays, and objects', () => {
    const resource = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: { name: 'test' },
      spec: {
        description: '',
        tools: [],
        overrides: {},
        prompt: 'hi',
      },
    };

    const result = cleanKubernetesResource(resource);
    expect(result).toEqual({
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: { name: 'test' },
      spec: { prompt: 'hi' },
    });
  });

  it('should preserve 0 and false values', () => {
    const resource = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Team',
      metadata: { name: 'test' },
      spec: {
        maxTurns: 0,
        loops: false,
        strategy: 'sequential',
      },
    };

    const result = cleanKubernetesResource(resource);
    expect(result).toEqual({
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Team',
      metadata: { name: 'test' },
      spec: {
        maxTurns: 0,
        loops: false,
        strategy: 'sequential',
      },
    });
  });

  it('should remove parent objects when all children are empty', () => {
    const resource = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: { name: 'test' },
      spec: {
        prompt: 'hello',
        modelRef: {
          name: null,
          namespace: undefined,
        },
      },
    };

    const result = cleanKubernetesResource(resource);
    expect(result).toEqual({
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: { name: 'test' },
      spec: { prompt: 'hello' },
    });
  });
});

describe('toKubernetesYaml', () => {
  it('should produce valid YAML output', () => {
    const resource = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: {
        name: 'my-agent',
        namespace: 'default',
        resourceVersion: '999',
      },
      spec: {
        description: 'A test agent',
        prompt: 'You are helpful',
      },
      status: { phase: 'Ready' },
    };

    const result = toKubernetesYaml(resource);
    expect(result).toContain('apiVersion: ark.mckinsey.com/v1alpha1');
    expect(result).toContain('kind: Agent');
    expect(result).toContain('name: my-agent');
    expect(result).toContain('description: A test agent');
    expect(result).not.toContain('resourceVersion');
    expect(result).not.toContain('status');
  });

  it('should render multiline prompts with block scalar style', () => {
    const resource = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: { name: 'my-agent' },
      spec: {
        prompt: 'Line one\nLine two\nLine three',
      },
    };

    const result = toKubernetesYaml(resource);
    expect(result).toContain('prompt: |-');
    expect(result).toContain('  Line one');
    expect(result).toContain('  Line two');
    expect(result).toContain('  Line three');
  });
});
