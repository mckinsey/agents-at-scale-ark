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

    it('should handle query error phase', async () => {
      const mockQueryResponse = {
        status: {
          phase: 'error',
          error: 'Query failed with test error',
        },
      };

      mockExeca.mockImplementation(async (command: string, args: string[]) => {
        if (args.includes('apply')) {
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

    it('should clean up query resource even on failure', async () => {
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

      expect(mockSpinner.fail).toHaveBeenCalledWith('Query failed');
      expect(mockOutput.error).toHaveBeenCalledWith('Failed to apply');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
