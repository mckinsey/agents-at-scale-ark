import {jest} from '@jest/globals';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockOra = {
  start: jest.fn().mockReturnThis(),
  stop: jest.fn(),
  succeed: jest.fn(),
  fail: jest.fn(),
  text: '',
};
jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => mockOra),
}));

const mockOutput = {
  warning: jest.fn(),
};
jest.unstable_mockModule('./output.js', () => ({
  default: mockOutput,
}));

jest.unstable_mockModule('./errors.js', () => ({
  ExitCodes: {
    Timeout: 1,
    OperationError: 2,
    CliError: 3,
  },
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

const {executeDirectEvaluation, executeQueryEvaluation} = await import('./executeEvaluation.js');

describe('executeEvaluation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeDirectEvaluation', () => {
    it('should submit evaluation and wait for completion', async () => {
      // Mock kubectl apply
      mockExeca.mockResolvedValueOnce({});
      // Mock kubectl wait
      mockExeca.mockResolvedValueOnce({});
      // Mock kubectl get
      mockExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          status: {
            phase: 'done',
            score: 1.0,
            passed: true,
            message: 'Success',
          },
        }),
      });

      await executeDirectEvaluation({
        evaluatorName: 'test-evaluator',
        input: 'test-input',
        output: 'test-output',
        timeout: '1m',
      });

      expect(mockExeca).toHaveBeenCalledTimes(3);
      expect(mockExeca).toHaveBeenNthCalledWith(1, 'kubectl', ['apply', '-f', '-'], expect.anything());
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Evaluation completed successfully'));
      expect(mockConsoleLog).toHaveBeenCalledWith('Score: 1');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PASSED'));
    });

    it('should handle evaluation error', async () => {
      mockExeca.mockResolvedValueOnce({});
      mockExeca.mockResolvedValueOnce({});
      mockExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          status: {
            phase: 'error',
            message: 'Evaluation failed',
          },
        }),
      });

      await expect(executeDirectEvaluation({
        evaluatorName: 'test-evaluator',
        input: 'test-input',
        output: 'test-output',
      })).rejects.toThrow('process.exit called');

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Evaluation failed'));
      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('should handle timeout', async () => {
      mockExeca.mockResolvedValueOnce({});
      mockExeca.mockRejectedValueOnce(new Error('timed out waiting'));

      await expect(executeDirectEvaluation({
        evaluatorName: 'test-evaluator',
        input: 'test-input',
        output: 'test-output',
      })).rejects.toThrow('process.exit called');

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Evaluation did not complete'));
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('executeQueryEvaluation', () => {
    it('should submit query evaluation', async () => {
      mockExeca.mockResolvedValueOnce({});
      mockExeca.mockResolvedValueOnce({});
      mockExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          status: {
            phase: 'done',
            passed: true,
          },
        }),
      });

      await executeQueryEvaluation({
        evaluatorName: 'test-evaluator',
        queryName: 'test-query',
        responseTarget: 'agent:test-agent',
      });

      expect(mockExeca).toHaveBeenCalledWith('kubectl', ['apply', '-f', '-'], expect.objectContaining({
        input: expect.stringContaining('"responseTarget":{"type":"agent","name":"test-agent"}'),
      }));
    });

    it('should validate response target format', async () => {
      await expect(executeQueryEvaluation({
        evaluatorName: 'test-evaluator',
        queryName: 'test-query',
        responseTarget: 'invalid-format',
      })).rejects.toThrow('process.exit called');

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Invalid response-target format'));
      expect(mockExit).toHaveBeenCalledWith(3);
    });
  });
});
