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
};

const mockOra = jest.fn(() => mockSpinner);
jest.unstable_mockModule('ora', () => ({
  default: mockOra,
}));

const mockOutput = {
  warning: jest.fn(),
  error: jest.fn(),
};
jest.unstable_mockModule('./output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest
  .spyOn(console, 'error')
  .mockImplementation(() => {});

const {executeQuery, parseTarget} = await import('./executeQuery.js');
const {ExitCodes} = await import('./errors.js');

describe('executeQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner.start.mockReturnValue(mockSpinner);
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

  describe('executeQuery', () => {
    it('should create and apply a query manifest', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'done',
          responses: [{content: 'Test response'}],
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('queries')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('Test response');
    });

    it('should handle query error phase and exit with code 2', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'error',
          responses: [{content: 'Query failed with test error'}],
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('queries')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      try {
        await executeQuery({
          targetType: 'model',
          targetName: 'default',
          message: 'Hello',
        });
      } catch (error: any) {
        expect(error.message).toBe('process.exit called');
      }

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Query failed with test error')
      );
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.OperationError);
    });

    it('should handle query canceled phase and exit with code 2', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'canceled',
          message: 'Query was canceled',
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('queries')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      try {
        await executeQuery({
          targetType: 'agent',
          targetName: 'test-agent',
          message: 'Hello',
        });
      } catch (error: any) {
        expect(error.message).toBe('process.exit called');
      }

      expect(mockSpinner.warn).toHaveBeenCalledWith('Query canceled');
      expect(mockOutput.warning).toHaveBeenCalledWith('Query was canceled');
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.OperationError);
    });

    it('should handle kubectl apply failures with exit code 1', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          throw new Error('Failed to apply');
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await expect(
        executeQuery({
          targetType: 'model',
          targetName: 'default',
          message: 'Hello',
        })
      ).rejects.toThrow('process.exit called');

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to apply')
      );
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.CliError);
    });

    it('should handle query timeout and exit with code 3', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          // Simulate kubectl wait timeout
          const error = new Error('timed out waiting for the condition');
          throw error;
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      try {
        await executeQuery({
          targetType: 'model',
          targetName: 'default',
          message: 'Hello',
          timeout: '100ms',
          watchTimeout: '200ms',
        });
      } catch (error: any) {
        expect(error.message).toBe('process.exit called');
      }

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Query did not complete within 200ms')
      );
      expect(mockExit).toHaveBeenCalledWith(ExitCodes.Timeout);
    });
  });
});
