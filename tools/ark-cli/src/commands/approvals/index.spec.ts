import {listApprovals, mapApprovalError} from './index.js';
import {
  ArkApiHttpError,
  type A2ATaskDetail,
  type A2ATaskListItem,
} from '../../lib/arkApiClient.js';
import {ExitCodes} from '../../lib/errors.js';

function detail(name: string): A2ATaskDetail {
  return {
    name,
    namespace: 'default',
    taskId: `${name}-id`,
    status: {
      phase: 'input-required',
      protocolMetadata: {
        timeout: '5m',
        onTimeout: 'reject',
        toolCalls: JSON.stringify([
          {id: 'c1', type: 'function', function: {name: 'write', arguments: '{}'}},
        ]),
      },
    },
  };
}

describe('listApprovals', () => {
  it('returns only tasks in the input-required phase', async () => {
    const tasks: A2ATaskListItem[] = [
      {name: 't1', namespace: 'default', taskId: 't1-id', phase: 'input-required'},
      {name: 't2', namespace: 'default', taskId: 't2-id', phase: 'running'},
    ];
    const client = {
      listA2ATasks: vi.fn().mockResolvedValue(tasks),
      getA2ATask: vi.fn().mockResolvedValue(detail('t1')),
    };

    const result = await listApprovals(client, 'default');

    expect(client.listA2ATasks).toHaveBeenCalledWith('default');
    expect(client.getA2ATask).toHaveBeenCalledTimes(1);
    expect(client.getA2ATask).toHaveBeenCalledWith('t1', 'default');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('t1');
    expect(result[0].toolCalls[0].function?.name).toBe('write');
  });

  it('returns an empty list when nothing is pending', async () => {
    const client = {
      listA2ATasks: vi.fn().mockResolvedValue([
        {name: 't2', namespace: 'default', taskId: 't2-id', phase: 'done'},
      ]),
      getA2ATask: vi.fn(),
    };

    const result = await listApprovals(client, 'default');

    expect(result).toEqual([]);
    expect(client.getA2ATask).not.toHaveBeenCalled();
  });

  it('falls back to a minimal entry when a pending task has no metadata', async () => {
    const client = {
      listA2ATasks: vi.fn().mockResolvedValue([
        {name: 't1', namespace: 'default', taskId: 't1-id', phase: 'input-required'},
      ]),
      getA2ATask: vi.fn().mockResolvedValue({
        name: 't1',
        namespace: 'default',
        taskId: 't1-id',
        status: {phase: 'input-required'},
      }),
    };

    const result = await listApprovals(client, 'default');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('t1');
    expect(result[0].toolCalls).toEqual([]);
  });
});

describe('mapApprovalError', () => {
  it('maps 404 to a not-found message with a non-zero exit code', () => {
    const {message, exitCode} = mapApprovalError(
      new ArkApiHttpError('nope', 404),
      't1'
    );
    expect(message).toContain('not found');
    expect(exitCode).toBe(ExitCodes.OperationError);
  });

  it('maps 409 to a not-awaiting-approval message', () => {
    const {message, exitCode} = mapApprovalError(
      new ArkApiHttpError('conflict', 409),
      't1'
    );
    expect(message).toContain('not awaiting approval');
    expect(exitCode).toBe(ExitCodes.OperationError);
  });

  it('maps a generic error to a CLI error exit code', () => {
    const {message, exitCode} = mapApprovalError(new Error('boom'), 't1');
    expect(message).toBe('boom');
    expect(exitCode).toBe(ExitCodes.CliError);
  });
});
