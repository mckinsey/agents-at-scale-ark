import {vi} from 'vitest';

import output from '../../lib/output.js';
import {
  ArkApiHttpError,
  type A2ATaskDetail,
  type A2ATaskListItem,
} from '../../lib/arkApiClient.js';
import {ExitCodes} from '../../lib/errors.js';

const mockStart = vi.fn();
const mockStop = vi.fn();

vi.mock('../../lib/arkApiProxy.js', () => ({
  ArkApiProxy: class {
    start = mockStart;
    stop = mockStop;
  },
}));

vi.mock('../../lib/config.js', () => ({
  loadConfig: vi.fn(() => ({services: {reusePortForwards: false}})),
}));

const {listApprovals, mapApprovalError, createApprovalsCommand} =
  await import('./index.js');

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
          {
            id: 'c1',
            type: 'function',
            function: {name: 'write', arguments: '{}'},
          },
        ]),
      },
    },
  };
}

describe('listApprovals', () => {
  it('returns only tasks in the input-required phase', async () => {
    const tasks: A2ATaskListItem[] = [
      {
        name: 't1',
        namespace: 'default',
        taskId: 't1-id',
        phase: 'input-required',
      },
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
      listA2ATasks: vi
        .fn()
        .mockResolvedValue([
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
      listA2ATasks: vi
        .fn()
        .mockResolvedValue([
          {
            name: 't1',
            namespace: 'default',
            taskId: 't1-id',
            phase: 'input-required',
          },
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

describe('createApprovalsCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  const pendingDetail: A2ATaskDetail = {
    name: 't1',
    namespace: 'default',
    taskId: 't1-id',
    status: {
      phase: 'input-required',
      startTime: '2000-01-01T00:00:00Z',
      protocolMetadata: {
        timeout: '5m',
        onTimeout: 'reject',
        context: JSON.stringify({AgentName: 'writer'}),
        toolCalls: JSON.stringify([
          {
            id: 'c1',
            type: 'function',
            function: {name: 'write', arguments: '{}'},
          },
        ]),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(output, 'info').mockImplementation(() => {});
    vi.spyOn(output, 'success').mockImplementation(() => {});
    vi.spyOn(output, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function clientWith(overrides: Record<string, unknown>) {
    return {
      listA2ATasks: vi.fn(),
      getA2ATask: vi.fn(),
      submitApproval: vi.fn(),
      ...overrides,
    };
  }

  it('lists pending approvals as text', async () => {
    const client = clientWith({
      listA2ATasks: vi
        .fn()
        .mockResolvedValue([
          {
            name: 't1',
            namespace: 'default',
            taskId: 't1-id',
            phase: 'input-required',
          },
        ] as A2ATaskListItem[]),
      getA2ATask: vi.fn().mockResolvedValue(pendingDetail),
    });
    mockStart.mockResolvedValue(client);

    const command = createApprovalsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(client.listA2ATasks).toHaveBeenCalledWith(undefined);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('t1');
    expect(printed).toContain('writer');
    expect(printed).toContain('write');
    expect(printed).toContain('expired');
    expect(mockStop).toHaveBeenCalled();
  });

  it('lists pending approvals as json with --output json', async () => {
    const client = clientWith({
      listA2ATasks: vi
        .fn()
        .mockResolvedValue([
          {
            name: 't1',
            namespace: 'default',
            taskId: 't1-id',
            phase: 'input-required',
          },
        ] as A2ATaskListItem[]),
      getA2ATask: vi.fn().mockResolvedValue(pendingDetail),
    });
    mockStart.mockResolvedValue(client);

    const command = createApprovalsCommand({});
    await command.parseAsync([
      'node',
      'test',
      'list',
      '--output',
      'json',
      '-n',
      'default',
    ]);

    expect(client.listA2ATasks).toHaveBeenCalledWith('default');
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const parsed = JSON.parse(printed);
    expect(parsed[0].name).toBe('t1');
  });

  it('reports when there are no pending approvals', async () => {
    const client = clientWith({
      listA2ATasks: vi
        .fn()
        .mockResolvedValue([
          {name: 't2', namespace: 'default', taskId: 't2-id', phase: 'running'},
        ] as A2ATaskListItem[]),
    });
    mockStart.mockResolvedValue(client);

    const command = createApprovalsCommand({});
    await command.parseAsync(['node', 'test', 'ls']);

    expect(output.info).toHaveBeenCalledWith('No pending approvals');
  });

  it('exits with a CLI error when listing fails', async () => {
    const client = clientWith({
      listA2ATasks: vi.fn().mockRejectedValue(new Error('down')),
    });
    mockStart.mockResolvedValue(client);

    const command = createApprovalsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(output.error).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.CliError);
    expect(mockStop).toHaveBeenCalled();
  });

  it('approves a pending tool call', async () => {
    const client = clientWith({
      submitApproval: vi.fn().mockResolvedValue({decision: 'approved'}),
    });
    mockStart.mockResolvedValue(client);

    const command = createApprovalsCommand({});
    await command.parseAsync([
      'node',
      'test',
      'approve',
      't1',
      '-n',
      'default',
    ]);

    expect(client.submitApproval).toHaveBeenCalledWith(
      't1',
      'approved',
      'default'
    );
    expect(output.success).toHaveBeenCalledWith("approval 't1' approved");
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('rejects a pending tool call', async () => {
    const client = clientWith({
      submitApproval: vi.fn().mockResolvedValue({decision: 'rejected'}),
    });
    mockStart.mockResolvedValue(client);

    const command = createApprovalsCommand({});
    await command.parseAsync(['node', 'test', 'reject', 't1']);

    expect(client.submitApproval).toHaveBeenCalledWith(
      't1',
      'rejected',
      undefined
    );
    expect(output.success).toHaveBeenCalledWith("approval 't1' rejected");
  });

  it('maps a 404 on approval to an operation error exit code', async () => {
    const client = clientWith({
      submitApproval: vi
        .fn()
        .mockRejectedValue(new ArkApiHttpError('nope', 404)),
    });
    mockStart.mockResolvedValue(client);

    const command = createApprovalsCommand({});
    await command.parseAsync(['node', 'test', 'approve', 'missing']);

    expect(output.error).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.OperationError);
    expect(mockStop).toHaveBeenCalled();
  });
});
