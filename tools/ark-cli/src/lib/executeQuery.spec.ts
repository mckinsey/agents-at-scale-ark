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
  text: '',
};

const mockOra = jest.fn(() => mockSpinner);
jest.unstable_mockModule('ora', () => ({
  default: mockOra,
}));

const mockOutput = {
  warning: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
jest.unstable_mockModule('./output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

const {executeQuery, parseTarget} = await import('./executeQuery.js');

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
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Query completed');
      expect(mockConsoleLog).toHaveBeenCalledWith('\nTest response');
    });

    it('should handle query error phase with condition message', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'error',
          conditions: [
            {
              type: 'Completed',
              message: 'Query failed with test error',
            },
          ],
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.fail).toHaveBeenCalledWith('Query failed');
      expect(mockOutput.error).toHaveBeenCalledWith(
        'Query failed with test error'
      );
    });

    it('should handle query error phase without condition message', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'error',
          conditions: [],
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.fail).toHaveBeenCalledWith('Query failed');
      expect(mockOutput.error).toHaveBeenCalledWith(
        'Query failed with unknown error'
      );
    });

    it('should handle query canceled phase', async () => {
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
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'agent',
        targetName: 'test-agent',
        message: 'Hello',
      });

      expect(mockSpinner.warn).toHaveBeenCalledWith('Query canceled');
      expect(mockOutput.warning).toHaveBeenCalledWith('Query was canceled');
    });

    it('should clean up query resource when it failed to apply', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          throw new Error('Failed to apply');
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
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

      expect(mockSpinner.fail).toHaveBeenCalledWith('Query failed to apply');
      expect(mockOutput.error).toHaveBeenCalledWith('Query failed to apply');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should not clean up query resource when it failed to apply and cleanup is disabled', async () => {
      const mockCleanupQuery = jest.fn();
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          throw new Error('Failed to apply');
        }
        if (args.includes('delete')) {
          mockCleanupQuery();
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await expect(
        executeQuery({
          targetType: 'model',
          targetName: 'default',
          message: 'Hello',
          cleanup: false,
        })
      ).rejects.toThrow('process.exit called');

      expect(mockSpinner.fail).toHaveBeenCalledWith('Query failed to apply');
      expect(mockOutput.error).toHaveBeenCalledWith('Query failed to apply');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockCleanupQuery).not.toHaveBeenCalled();
    });


    it('should handle query timeout', async () => {
      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          throw new Error('Timeout');
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
        timeoutSeconds: 5,
      });

      expect(mockSpinner.fail).toHaveBeenCalledWith('Query timed out');
      expect(mockOutput.error).toHaveBeenCalledWith(
        'Query did not complete within 5 seconds'
      );
    });

    it('should handle query with no responses', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'done',
          responses: [],
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Query completed');
      expect(mockOutput.warning).toHaveBeenCalledWith('No response received');
    });

    it('should handle query with response without content', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'done',
          responses: ['Raw response string'],
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Query completed');
      expect(mockConsoleLog).toHaveBeenCalledWith('\nRaw response string');
    });

    it('should handle query with custom timeout and cleanup disabled', async () => {
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
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        // No delete calls should be made when cleanup is disabled
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'agent',
        targetName: 'test-agent',
        message: 'Hello',
        timeoutSeconds: 60,
        cleanup: false,
      });

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Query completed');
      expect(mockConsoleLog).toHaveBeenCalledWith('\nTest response');
    });

    it('should handle cleanup failure gracefully', async () => {
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
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        if (args.includes('delete')) {
          throw new Error('Delete failed');
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Query completed');
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringMatching(/^Failed to cleanup query cli-query-/)
      );
    });

    it('should handle query with unknown phase', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'unknown',
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('wait')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        if (args.includes('get') && args.includes('query')) {
          return {
            stdout: JSON.stringify(mockQueryResponse),
            stderr: '',
            exitCode: 0,
          };
        }
        if (args.includes('delete')) {
          return {stdout: '', stderr: '', exitCode: 0};
        }
        return {stdout: '', stderr: '', exitCode: 0};
      });

      await executeQuery({
        targetType: 'model',
        targetName: 'default',
        message: 'Hello',
      });

      expect(mockSpinner.warn).toHaveBeenCalledWith('Query completed but with unknown status');
      expect(mockOutput.warning).toHaveBeenCalledWith('Query completed but with unknown status');
    });
  });
});
