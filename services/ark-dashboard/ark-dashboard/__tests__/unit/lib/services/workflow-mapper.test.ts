import { describe, it, expect } from 'vitest';

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
