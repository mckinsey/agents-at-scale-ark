import {buildApprovalDetails} from './approvalDetails.js';
import type {A2ATaskDetail} from '../../lib/arkApiClient.js';

describe('buildApprovalDetails', () => {
  it('returns null when the task has no approval metadata', () => {
    const task: A2ATaskDetail = {
      name: 't1',
      namespace: 'default',
      taskId: 'id1',
      status: {phase: 'running'},
    };
    expect(buildApprovalDetails(task)).toBeNull();
  });

  it('parses well-formed protocol metadata', () => {
    const task: A2ATaskDetail = {
      name: 't1',
      namespace: 'default',
      taskId: 'id1',
      status: {
        phase: 'input-required',
        startTime: '2000-01-01T00:00:00Z',
        protocolMetadata: {
          timeout: '5m',
          onTimeout: 'reject',
          context: JSON.stringify({AgentName: 'writer'}),
          toolCalls: JSON.stringify([
            {id: 'c1', type: 'function', function: {name: 'write', arguments: '{}'}},
          ]),
        },
      },
    };

    const details = buildApprovalDetails(task);
    expect(details).not.toBeNull();
    expect(details?.name).toBe('t1');
    expect(details?.agentName).toBe('writer');
    expect(details?.timeout).toBe('5m');
    expect(details?.onTimeout).toBe('reject');
    expect(details?.toolCalls).toHaveLength(1);
    expect(details?.toolCalls[0].function?.name).toBe('write');
    // startTime far in the past + 5m timeout => expired
    expect(details?.expiresAt).toBeInstanceOf(Date);
    expect(details?.expired).toBe(true);
  });

  it('degrades gracefully on malformed tool calls and context', () => {
    const task: A2ATaskDetail = {
      name: 't1',
      namespace: 'default',
      taskId: 'id1',
      agentRef: {name: 'fallback-agent'},
      status: {
        phase: 'input-required',
        protocolMetadata: {
          toolCalls: 'not-json',
          context: 'not-json',
        },
      },
    };

    const details = buildApprovalDetails(task);
    expect(details?.toolCalls).toEqual([]);
    // agent name falls back to agentRef when context is unparseable
    expect(details?.agentName).toBe('fallback-agent');
    // no startTime/timeout => not expired
    expect(details?.expired).toBe(false);
    expect(details?.expiresAt).toBeUndefined();
  });
});
