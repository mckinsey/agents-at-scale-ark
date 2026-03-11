import {vi} from 'vitest';

const mockChatClient = {
  getQueryTargets: vi.fn(),
};

vi.mock('../../lib/chatClient.js', () => ({
  ChatClient: vi.fn().mockImplementation(() => mockChatClient),
}));

const {createConnectingToArkOperation} = await import('./connectingToArk.js');

describe('createConnectingToArkOperation', () => {
  const mockArkApiClient = {} as any;
  const mockOnSuccess = vi.fn();
  const mockOnQuit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates operation with correct message', () => {
    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    expect(operation.message).toBe('Connecting to Ark...');
    expect(operation.hideOnSuccess).toBe(true);
    expect(operation.errorOptions).toHaveLength(3);
  });

  it('selects specified target when initialTargetId matches', async () => {
    const targets = [
      {id: 'agent/test-agent', type: 'agent', name: 'test-agent'},
      {id: 'model/default', type: 'model', name: 'default'},
    ];
    mockChatClient.getQueryTargets.mockResolvedValue(targets);

    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      initialTargetId: 'model/default',
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    await operation.operation({} as AbortSignal);

    expect(mockOnSuccess).toHaveBeenCalledWith({
      client: expect.anything(),
      targets,
      selectedTarget: targets[1],
      selectedIndex: 1,
    });
  });

  it('throws error when initialTargetId not found', async () => {
    const targets = [
      {id: 'agent/test-agent', type: 'agent', name: 'test-agent'},
    ];
    mockChatClient.getQueryTargets.mockResolvedValue(targets);

    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      initialTargetId: 'model/nonexistent',
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    await expect(operation.operation({} as AbortSignal)).rejects.toThrow(
      'Target "model/nonexistent" not found. Use "ark targets list" to see available targets.'
    );
  });

  it('selects first agent when no initialTargetId', async () => {
    const targets = [
      {id: 'model/default', type: 'model', name: 'default'},
      {id: 'agent/test-agent', type: 'agent', name: 'test-agent'},
    ];
    mockChatClient.getQueryTargets.mockResolvedValue(targets);

    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    await operation.operation({} as AbortSignal);

    expect(mockOnSuccess).toHaveBeenCalledWith({
      client: expect.anything(),
      targets,
      selectedTarget: targets[1],
      selectedIndex: 1,
    });
  });

  it('selects first model when no agents available', async () => {
    const targets = [
      {id: 'model/default', type: 'model', name: 'default'},
      {id: 'tool/calculator', type: 'tool', name: 'calculator'},
    ];
    mockChatClient.getQueryTargets.mockResolvedValue(targets);

    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    await operation.operation({} as AbortSignal);

    expect(mockOnSuccess).toHaveBeenCalledWith({
      client: expect.anything(),
      targets,
      selectedTarget: targets[0],
      selectedIndex: 0,
    });
  });

  it('selects first tool when no agents or models available', async () => {
    const targets = [
      {id: 'tool/calculator', type: 'tool', name: 'calculator'},
    ];
    mockChatClient.getQueryTargets.mockResolvedValue(targets);

    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    await operation.operation({} as AbortSignal);

    expect(mockOnSuccess).toHaveBeenCalledWith({
      client: expect.anything(),
      targets,
      selectedTarget: targets[0],
      selectedIndex: 0,
    });
  });

  it('throws error when no targets available', async () => {
    mockChatClient.getQueryTargets.mockResolvedValue([]);

    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    await expect(operation.operation({} as AbortSignal)).rejects.toThrow(
      'No agents, models, or tools available'
    );
  });

  it('throws error when targets exist but none match agent/model/tool types', async () => {
    const targets = [
      {id: 'other/something', type: 'other', name: 'something'},
    ];
    mockChatClient.getQueryTargets.mockResolvedValue(targets);

    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    await expect(operation.operation({} as AbortSignal)).rejects.toThrow(
      'No targets available'
    );
  });

  it('error options include try again, check status, and quit', () => {
    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    expect(operation.errorOptions![0].label).toBe('Try again');
    expect(operation.errorOptions![1].label).toBe('Check status');
    expect(operation.errorOptions![2].label).toBe('Quit');
  });

  it('quit option calls onQuit callback', () => {
    const operation = createConnectingToArkOperation({
      arkApiClient: mockArkApiClient,
      onSuccess: mockOnSuccess,
      onQuit: mockOnQuit,
    });

    operation.errorOptions![2].onSelect();

    expect(mockOnQuit).toHaveBeenCalled();
  });
});
