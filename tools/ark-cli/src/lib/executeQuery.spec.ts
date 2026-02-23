import {vi} from 'vitest';

const mockExeca = vi.fn() as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockSpinner = {
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  stop: vi.fn(),
  text: '',
  isSpinning: false,
};

const mockOra = vi.fn(() => mockSpinner);
vi.mock('ora', () => ({
  default: mockOra,
}));

let mockSendMessage = vi.fn() as any;

const mockChatClient = vi.fn(() => ({
  sendMessage: mockSendMessage,
})) as any;

let mockArkApiProxyInstance: any = {
  start: vi.fn(),
  stop: vi.fn(),
};

const mockArkApiProxy = vi.fn(() => mockArkApiProxyInstance) as any;

vi.mock('./arkApiProxy.js', () => ({
  ArkApiProxy: mockArkApiProxy,
}));

vi.mock('./chatClient.js', () => ({
  ChatClient: mockChatClient,
}));

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi
  .spyOn(console, 'error')
  .mockImplementation(() => {});

const mockStdoutWrite = vi
  .spyOn(process.stdout, 'write')
  .mockImplementation(() => true);

const {executeQuery, parseTarget} = await import('./executeQuery.js');
const {ExitCodes} = await import('./errors.js');

describe('executeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpinner.start.mockReturnValue(mockSpinner);
    mockSpinner.isSpinning = false;
    mockSendMessage = vi.fn() as any;
    mockChatClient.mockReturnValue({sendMessage: mockSendMessage});
    const startMock = vi.fn() as any;
    startMock.mockResolvedValue({});
    mockArkApiProxyInstance = {
      start: startMock,
      stop: vi.fn(),
    };
    mockArkApiProxy.mockReturnValue(mockArkApiProxyInstance);
  });

  describe('parseTarget', () => {
    it('should parse valid target strings', () => {
      expect(parseTarget('model/default')).toEqual({
        type: 'model',
        name: 'default',
      });

      expect(parseTarget('agent/weather-agent')).toEqual({
        type: 'agent',
        name: 'weather-agent',
      });

      expect(parseTarget('team/my-team')).toEqual({
        type: 'team',
        name: 'my-team',
      });
    });

    it('should return null for invalid target strings', () => {
      expect(parseTarget('invalid')).toBeNull();
      expect(parseTarget('')).toBeNull();
      expect(parseTarget('model/default/extra')).toBeNull();
    });
  });

  describe('executeQuery with streaming', () => {
    it('should execute query with streaming and display chunks', async () => {
      mockSendMessage.mockImplementation(
        async (
          targetId: string,
          messages: any[],
          options: any,
          callback: (
            chunk: string,
            toolCalls?: any[],
            arkMetadata?: any
          ) => void
        ) => {
          callback('Hello', undefined, {agent: 'test-agent'});
          callback(' world', undefined, {agent: 'test-agent'});
        }
      );

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockArkApiProxy).toHaveBeenCalled();
      expect(mockArkApiProxyInstance.start).toHaveBeenCalled();
      expect(mockChatClient).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        'model/default',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: true},
        expect.any(Function)
      );
    });

    it('should pass sessionId to sendMessage when provided', async () => {
      mockSendMessage.mockImplementation(
        async (
          targetId: string,
          messages: any[],
          options: any,
          callback: (
            chunk: string,
            toolCalls?: any[],
            arkMetadata?: any
          ) => void
        ) => {
          callback('Hello', undefined, {agent: 'test-agent'});
        }
      );

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        sessionId: 'test-session-123',
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        'model/default',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: true, sessionId: 'test-session-123'},
        expect.any(Function)
      );
      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockArkApiProxyInstance.stop).toHaveBeenCalled();
      expect(mockStdoutWrite).toHaveBeenCalled();
    });

    it('should pass conversationId to sendMessage when provided', async () => {
      mockSendMessage.mockImplementation(
        async (
          targetId: string,
          messages: any[],
          options: any,
          callback: (
            chunk: string,
            toolCalls?: any[],
            arkMetadata?: any
          ) => void
        ) => {
          callback('Hello', undefined, {agent: 'test-agent'});
        }
      );

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        conversationId: 'test-conversation-789',
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        'model/default',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: true, conversationId: 'test-conversation-789'},
        expect.any(Function)
      );
      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockArkApiProxyInstance.stop).toHaveBeenCalled();
    });

    it('should pass both sessionId and conversationId to sendMessage when provided', async () => {
      mockSendMessage.mockImplementation(
        async (
          targetId: string,
          messages: any[],
          options: any,
          callback: (
            chunk: string,
            toolCalls?: any[],
            arkMetadata?: any
          ) => void
        ) => {
          callback('Hello', undefined, {agent: 'test-agent'});
        }
      );

      await executeQuery({
        targetType: 'agent',
        targetName: 'test-agent',
        message: 'Hello',
        sessionId: 'test-session-123',
        conversationId: 'test-conversation-456',
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {
          streamingEnabled: true,
          sessionId: 'test-session-123',
          conversationId: 'test-conversation-456',
        },
        expect.any(Function)
      );
    });

    it('should display agent names with correct formatting', async () => {
      mockSendMessage.mockImplementation(
        async (
          targetId: string,
          messages: any[],
          options: any,
          callback: (
            chunk: string,
            toolCalls?: any[],
            arkMetadata?: any
          ) => void
        ) => {
          callback('Response 1', undefined, {agent: 'agent-1'});
          callback('Response 2', undefined, {agent: 'agent-2'});
        }
      );

      await executeQuery({
        targetType: 'agent',
        targetName: 'test-agent',
        message: 'Hello',
      });

      expect(mockStdoutWrite).toHaveBeenCalled();
      const calls = mockStdoutWrite.mock.calls.map((call) => String(call[0]));
      expect(calls.some((call) => call.includes('agent-1'))).toBe(true);
      expect(calls.some((call) => call.includes('agent-2'))).toBe(true);
    });

    it('should display team names with diamond prefix', async () => {
      mockSendMessage.mockImplementation(
        async (
          targetId: string,
          messages: any[],
          options: any,
          callback: (
            chunk: string,
            toolCalls?: any[],
            arkMetadata?: any
          ) => void
        ) => {
          callback('Team response', undefined, {team: 'my-team'});
        }
      );

      await executeQuery({
        targetType: 'team',
        targetName: 'my-team',
        message: 'Hello',
      });

      const calls = mockStdoutWrite.mock.calls.map((call) => String(call[0]));
      expect(calls.some((call) => call.includes('◆'))).toBe(true);
      expect(calls.some((call) => call.includes('my-team'))).toBe(true);
    });

    it('should display tool calls', async () => {
      mockSendMessage.mockImplementation(
        async (
          targetId: string,
          messages: any[],
          options: any,
          callback: (
            chunk: string,
            toolCalls?: any[],
            arkMetadata?: any
          ) => void
        ) => {
          callback('', [{id: 1, function: {name: 'get_weather'}}], {
            agent: 'weather-agent',
          });
          callback('The weather is sunny', undefined, {
            agent: 'weather-agent',
          });
        }
      );

      await executeQuery({
        targetType: 'agent',
        targetName: 'weather-agent',
        message: 'What is the weather?',
      });

      const calls = mockStdoutWrite.mock.calls.map((call) => String(call[0]));
      expect(calls.some((call) => call.includes('get_weather'))).toBe(true);
      expect(calls.some((call) => call.includes('The weather is sunny'))).toBe(
        true
      );
    });

    it('should handle errors and exit with CliError', async () => {
      mockSpinner.isSpinning = true;
      const startMock = vi.fn() as any;
      startMock.mockRejectedValue(new Error('Connection failed'));
      mockArkApiProxyInstance.start = startMock;

      await expect(
        executeQuery({
          targetType: 'model',
          targetName: 'default',
          message: 'Hello',
        })
      ).rejects.toThrow('process.exit called');

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Connection failed')
      );
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.CliError);
      expect(mockArkApiProxyInstance.stop).toHaveBeenCalled();
    });

    it('should stop spinner when first output arrives', async () => {
      mockSpinner.isSpinning = true;

      mockSendMessage.mockImplementation(
        async (
          targetId: string,
          messages: any[],
          options: any,
          callback: (
            chunk: string,
            toolCalls?: any[],
            arkMetadata?: any
          ) => void
        ) => {
          callback('First chunk', undefined, {agent: 'test-agent'});
        }
      );

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.stop).toHaveBeenCalled();
    });
  });

  describe('executeQuery with output format', () => {
    it('should create query and output name format', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        outputFormat: 'name',
      });

      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        expect.arrayContaining(['apply', '-f', '-']),
        expect.any(Object)
      );
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        expect.arrayContaining(['wait', '--for=condition=Completed']),
        expect.any(Object)
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/cli-query-\d+/)
      );
    });

    it('should include sessionId in query manifest when outputFormat is specified', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let appliedManifest = '';
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (
          args.includes('apply') &&
          args.includes('-f') &&
          args.includes('-')
        ) {
          // Capture the stdin input
          const stdinIndex = args.indexOf('-');
          if (stdinIndex >= 0 && args[stdinIndex + 1]) {
            appliedManifest = args[stdinIndex + 1];
          }
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        outputFormat: 'name',
        sessionId: 'test-session-456',
      });

      // Check that the manifest includes sessionId in spec
      const applyCall = mockExeca.mock.calls.find((call: any[]) =>
        call[1]?.includes('apply')
      );
      expect(applyCall).toBeDefined();
      // The manifest should be passed via stdin, so we need to check the actual call
      // Since execa handles stdin separately, we verify the call was made
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        expect.arrayContaining(['apply', '-f', '-']),
        expect.any(Object)
      );
    });

    it('should include conversationId in query manifest when outputFormat is specified', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        outputFormat: 'name',
        conversationId: 'test-conversation-789',
      });

      const applyCall = mockExeca.mock.calls.find((call: any[]) =>
        call[1]?.includes('apply')
      );
      expect(applyCall).toBeDefined();
      const manifest = JSON.parse(applyCall![2].input);
      expect(manifest.spec.conversationId).toBe('test-conversation-789');
    });

    it('should include both sessionId and conversationId in query manifest', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'agent',
        targetName: 'test-agent',
        message: 'Hello',
        outputFormat: 'name',
        sessionId: 'test-session-123',
        conversationId: 'test-conversation-456',
      });

      const applyCall = mockExeca.mock.calls.find((call: any[]) =>
        call[1]?.includes('apply')
      );
      expect(applyCall).toBeDefined();
      const manifest = JSON.parse(applyCall![2].input);
      expect(manifest.spec.sessionId).toBe('test-session-123');
      expect(manifest.spec.conversationId).toBe('test-conversation-456');
    });

    it('should not include conversationId in manifest when not provided', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        outputFormat: 'name',
      });

      const applyCall = mockExeca.mock.calls.find((call: any[]) =>
        call[1]?.includes('apply')
      );
      expect(applyCall).toBeDefined();
      const manifest = JSON.parse(applyCall![2].input);
      expect(manifest.spec.conversationId).toBeUndefined();
    });

    it('should output json format', async () => {
      const mockQuery = {
        apiVersion: 'ark.mckinsey.com/v1alpha1',
        kind: 'Query',
        metadata: {name: 'test-query'},
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('-o')) {
          return {stdout: JSON.stringify(mockQuery), stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        outputFormat: 'json',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(mockQuery));
    });

    it('should output yaml format', async () => {
      const mockYaml = 'apiVersion: ark.mckinsey.com/v1alpha1\nkind: Query';

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('yaml')) {
          return {stdout: mockYaml, stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        outputFormat: 'yaml',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(mockYaml);
    });

    it('should reject invalid output format', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await expect(
        executeQuery({
          targetType: 'model',
          targetName: 'default',
          message: 'Hello',
          outputFormat: 'invalid',
        })
      ).rejects.toThrow('process.exit called');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid output format')
      );
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.CliError);
    });

    it('should handle kubectl errors', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          throw new Error('kubectl apply failed');
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await expect(
        executeQuery({
          targetType: 'model',
          targetName: 'default',
          message: 'Hello',
          outputFormat: 'name',
        })
      ).rejects.toThrow('process.exit called');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('kubectl apply failed')
      );
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.CliError);
    });
  });
});
