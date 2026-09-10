import { describe, expect, it } from 'vitest';

import {
  mapArgoWorkflowToSession,
  mapArgoWorkflowsToSessions,
} from '@/lib/services/workflow-mapper';
import type { ArgoWorkflow } from '@/lib/types/argo-workflow';

function makeWorkflow(overrides: Partial<ArgoWorkflow> = {}): ArgoWorkflow {
  return {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'Workflow',
    metadata: {
      name: 'wf-1',
      namespace: 'default',
      creationTimestamp: '2024-01-01T00:00:00Z',
      uid: 'uid-1',
    },
    spec: {},
    ...overrides,
  } as ArgoWorkflow;
}

type NodeMap = NonNullable<NonNullable<ArgoWorkflow['status']>['nodes']>;

function pod(
  id: string,
  displayName: string,
  children?: string[],
): NodeMap[string] {
  return {
    id,
    name: `wf-1.${displayName}`,
    displayName,
    type: 'Pod',
    phase: 'Succeeded',
    boundaryID: 'wf-1',
    podName: id,
    children,
  };
}

function stepGroup(
  id: string,
  index: number,
  children: string[],
): NodeMap[string] {
  return {
    id,
    name: `wf-1[${index}]`,
    displayName: `[${index}]`,
    type: 'StepGroup',
    phase: 'Succeeded',
    boundaryID: 'wf-1',
    children,
  };
}

function retry(
  id: string,
  displayName: string,
  children: string[],
): NodeMap[string] {
  return {
    id,
    name: `wf-1.${displayName}`,
    displayName,
    type: 'Retry',
    phase: 'Succeeded',
    boundaryID: 'wf-1',
    children,
  };
}

function stepsWorkflow(nodes: NodeMap): ArgoWorkflow {
  return makeWorkflow({
    status: {
      phase: 'Succeeded',
      startedAt: '2024-01-01T00:00:00Z',
      finishedAt: '2024-01-01T00:01:00Z',
      nodes,
    },
  });
}

function retryChainNodes(): NodeMap {
  return {
    'wf-1': {
      id: 'wf-1',
      name: 'wf-1',
      displayName: 'wf-1',
      type: 'Steps',
      phase: 'Succeeded',
      children: ['sg-0'],
      outboundNodes: ['step-5'],
    },
    'sg-0': stepGroup('sg-0', 0, ['step-1']),
    'step-1': pod('step-1', 'log-step-1', ['sg-1']),
    'sg-1': stepGroup('sg-1', 1, ['step-2']),
    'step-2': retry('step-2', 'log-step-2', ['step-2(0)']),
    'step-2(0)': pod('step-2(0)', 'log-step-2(0)', ['sg-2']),
    'sg-2': stepGroup('sg-2', 2, ['step-3']),
    'step-3': pod('step-3', 'log-step-3', ['sg-3']),
    'sg-3': stepGroup('sg-3', 3, ['step-4']),
    'step-4': retry('step-4', 'log-step-4', ['step-4(0)']),
    'step-4(0)': pod('step-4(0)', 'log-step-4(0)', ['sg-4']),
    'sg-4': stepGroup('sg-4', 4, ['step-5']),
    'step-5': pod('step-5', 'log-step-5'),
  };
}

describe('mapArgoWorkflowToSession', () => {
  it('does not throw when status is missing and falls back to creationTimestamp', () => {
    const workflow = makeWorkflow({ status: undefined });

    const session = mapArgoWorkflowToSession(workflow);

    expect(session.status).toBe('pending');
    expect(session.startedAt).toBe('2024-01-01T00:00:00Z');
    expect(session.finishedAt).toBeUndefined();
    expect(session.steps).toEqual([]);
    expect(session.namespace).toBe('default');
    expect(session.uid).toBe('uid-1');
  });

  it('maps a succeeded workflow with timing information', () => {
    const workflow = makeWorkflow({
      status: {
        phase: 'Succeeded',
        startedAt: '2024-01-01T00:00:00Z',
        finishedAt: '2024-01-01T00:00:30Z',
        nodes: {},
      },
    });

    const session = mapArgoWorkflowToSession(workflow);

    expect(session.status).toBe('succeeded');
    expect(session.startedAt).toBe('2024-01-01T00:00:00Z');
    expect(session.finishedAt).toBe('2024-01-01T00:00:30Z');
    expect(session.duration).toBe('30s');
  });

  it('maps DAG child nodes into steps', () => {
    const workflow = makeWorkflow({
      status: {
        phase: 'Succeeded',
        startedAt: '2024-01-01T00:00:00Z',
        finishedAt: '2024-01-01T00:01:00Z',
        nodes: {
          'wf-1': {
            id: 'wf-1',
            name: 'wf-1',
            displayName: 'wf-1',
            type: 'DAG',
            phase: 'Succeeded',
            children: ['wf-1-task-a'],
          },
          'wf-1-task-a': {
            id: 'wf-1-task-a',
            name: 'wf-1.task-a',
            displayName: 'task-a',
            type: 'Pod',
            phase: 'Succeeded',
            boundaryID: 'wf-1',
            startedAt: '2024-01-01T00:00:05Z',
            finishedAt: '2024-01-01T00:00:20Z',
          },
        },
      },
    });

    const session = mapArgoWorkflowToSession(workflow);

    expect(session.steps).toHaveLength(1);
    expect(session.steps[0].displayName).toBe('task-a');
    expect(session.steps[0].status).toBe('succeeded');
  });

  it('walks past Retry nodes and keeps every step', () => {
    const session = mapArgoWorkflowToSession(stepsWorkflow(retryChainNodes()));

    expect(session.steps.map(step => step.displayName)).toEqual([
      'log-step-1',
      'log-step-2',
      'log-step-3',
      'log-step-4',
      'log-step-5',
    ]);
  });

  it('nests a single retry attempt under its retry step', () => {
    const session = mapArgoWorkflowToSession(stepsWorkflow(retryChainNodes()));

    const retryStep = session.steps[1];
    expect(retryStep.type).toBe('retry');
    expect(retryStep.children).toHaveLength(1);
    expect(retryStep.children?.[0].displayName).toBe('log-step-2(0)');
    expect(retryStep.children?.[0].detail?.podName).toBe('step-2(0)');
    expect(retryStep.detail?.podName).toBeUndefined();
  });

  it('exposes every retry attempt and still reaches the following step', () => {
    const nodes = retryChainNodes();
    nodes['step-2'].children = ['step-2(0)', 'step-2(1)'];
    nodes['step-2(0)'] = {
      ...pod('step-2(0)', 'log-step-2(0)'),
      phase: 'Failed',
    };
    nodes['step-2(1)'] = pod('step-2(1)', 'log-step-2(1)', ['sg-2']);

    const session = mapArgoWorkflowToSession(stepsWorkflow(nodes));

    const attempts = session.steps[1].children ?? [];
    expect(attempts.map(attempt => attempt.status)).toEqual([
      'failed',
      'succeeded',
    ]);
    expect(session.steps.map(step => step.displayName)).toContain('log-step-3');
  });

  it('does not duplicate retry attempts as DAG siblings', () => {
    const session = mapArgoWorkflowToSession(
      stepsWorkflow({
        'wf-1': {
          id: 'wf-1',
          name: 'wf-1',
          displayName: 'wf-1',
          type: 'DAG',
          phase: 'Succeeded',
          children: ['task-a', 'task-b'],
        },
        'task-a': pod('task-a', 'task-a'),
        'task-b': retry('task-b', 'task-b', ['task-b(0)']),
        'task-b(0)': pod('task-b(0)', 'task-b(0)'),
      }),
    );

    expect(session.steps.map(step => step.displayName)).toEqual([
      'task-a',
      'task-b',
    ]);
    expect(session.steps[1].children?.[0].displayName).toBe('task-b(0)');
  });

  it('continues past a parallel group whose member is retried', () => {
    const session = mapArgoWorkflowToSession(
      stepsWorkflow({
        'wf-1': {
          id: 'wf-1',
          name: 'wf-1',
          displayName: 'wf-1',
          type: 'Steps',
          phase: 'Succeeded',
          children: ['sg-0'],
          outboundNodes: ['step-last'],
        },
        'sg-0': stepGroup('sg-0', 0, ['step-a', 'step-b']),
        'step-a': retry('step-a', 'step-a', ['step-a(0)']),
        'step-a(0)': pod('step-a(0)', 'step-a(0)', ['sg-1']),
        'step-b': pod('step-b', 'step-b'),
        'sg-1': stepGroup('sg-1', 1, ['step-last']),
        'step-last': pod('step-last', 'step-last'),
      }),
    );

    expect(session.steps).toHaveLength(2);
    expect(session.steps[0].children?.map(child => child.displayName)).toEqual([
      'step-a',
      'step-b',
    ]);
    expect(session.steps[1].displayName).toBe('step-last');
  });

  it('keeps mapping a plain sequential workflow without retries', () => {
    const session = mapArgoWorkflowToSession(
      stepsWorkflow({
        'wf-1': {
          id: 'wf-1',
          name: 'wf-1',
          displayName: 'wf-1',
          type: 'Steps',
          phase: 'Succeeded',
          children: ['sg-0'],
          outboundNodes: ['step-2'],
        },
        'sg-0': stepGroup('sg-0', 0, ['step-1']),
        'step-1': pod('step-1', 'step-1', ['sg-1']),
        'sg-1': stepGroup('sg-1', 1, ['step-2']),
        'step-2': pod('step-2', 'step-2'),
      }),
    );

    expect(session.steps.map(step => step.displayName)).toEqual([
      'step-1',
      'step-2',
    ]);
  });
});

describe('mapArgoWorkflowsToSessions', () => {
  it('maps a list containing a status-less workflow without throwing', () => {
    const workflows = [
      makeWorkflow({
        metadata: {
          name: 'done',
          namespace: 'default',
          creationTimestamp: '2024-01-01T00:00:00Z',
          uid: 'uid-done',
        },
        status: { phase: 'Succeeded', nodes: {} },
      }),
      makeWorkflow({
        metadata: {
          name: 'pending-no-status',
          namespace: 'default',
          creationTimestamp: '2024-01-02T00:00:00Z',
          uid: 'uid-pending',
        },
        status: undefined,
      }),
    ];

    const sessions = mapArgoWorkflowsToSessions(workflows);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].status).toBe('succeeded');
    expect(sessions[1].status).toBe('pending');
    expect(sessions[1].startedAt).toBe('2024-01-02T00:00:00Z');
  });
});
