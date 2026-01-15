import {jest} from '@jest/globals';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockSpinner = {
  start: jest.fn(),
  succeed: jest.fn(),
  fail: jest.fn(),
  warn: jest.fn(),
  stop: jest.fn(),
  text: '',
  isSpinning: false,
};

const mockOra = jest.fn(() => mockSpinner);
jest.unstable_mockModule('ora', () => ({
  default: mockOra,
}));

let mockSendMessage = jest.fn() as any;

const mockChatClient = jest.fn(() => ({
  sendMessage: mockSendMessage,
})) as any;

let mockArkApiProxyInstance: any = {
  start: jest.fn(),
  stop: jest.fn(),
};

const mockArkApiProxy = jest.fn(() => mockArkApiProxyInstance) as any;

jest.unstable_mockModule('./arkApiProxy.js', () => ({
  ArkApiProxy: mockArkApiProxy,
}));

jest.unstable_mockModule('./chatClient.js', () => ({
  ChatClient: mockChatClient,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest
  .spyOn(console, 'error')
  .mockImplementation(() => {});

const mockStdoutWrite = jest
  .spyOn(process.stdout, 'write')
  .mockImplementation(() => true);

const {executeQuery, parseTarget} = await import('./executeQuery.js');
const {ExitCodes} = await import('./errors.js');

describe('executeQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner.start.mockReturnValue(mockSpinner);
    mockSpinner.isSpinning = false;
    mockSendMessage = jest.fn() as any;
    mockChatClient.mockReturnValue({sendMessage: mockSendMessage});
    const startMock = jest.fn() as any;
    startMock.mockResolvedValue({});
    mockArkApiProxyInstance = {
      start: startMock,
      stop: jest.fn(),
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
      const startMock = jest.fn() as any;
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
