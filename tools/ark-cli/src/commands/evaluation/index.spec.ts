import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockExecuteDirectEvaluation = jest.fn() as any;
const mockExecuteQueryEvaluation = jest.fn() as any;

jest.unstable_mockModule('../../lib/executeEvaluation.js', () => ({
  executeDirectEvaluation: mockExecuteDirectEvaluation,
  executeQueryEvaluation: mockExecuteQueryEvaluation,
}));

const {createEvaluationCommand} = await import('./index.js');

describe('createEvaluationCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create an evaluation command', () => {
    const command = createEvaluationCommand({} as any);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('evaluation');
    expect(command.description()).toBe(
      'Execute evaluations against evaluators'
    );
  });

  describe('direct evaluation', () => {
    it('should execute direct evaluation with required options', async () => {
      mockExecuteDirectEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      await command.parseAsync([
        'node',
        'test',
        'my-evaluator',
        '--input',
        'test-input',
        '--output',
        'test-output',
      ]);

      expect(mockExecuteDirectEvaluation).toHaveBeenCalledWith({
        evaluatorName: 'my-evaluator',
        input: 'test-input',
        output: 'test-output',
        timeout: undefined,
        watchTimeout: undefined,
      });
    });

    it('should execute direct evaluation with timeout options', async () => {
      mockExecuteDirectEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      await command.parseAsync([
        'node',
        'test',
        'my-evaluator',
        '--input',
        'test-input',
        '--output',
        'test-output',
        '--timeout',
        '10m',
        '--watch-timeout',
        '11m',
      ]);

      expect(mockExecuteDirectEvaluation).toHaveBeenCalledWith({
        evaluatorName: 'my-evaluator',
        input: 'test-input',
        output: 'test-output',
        timeout: '10m',
        watchTimeout: '11m',
      });
    });
  });

  describe('query evaluation', () => {
    it('should execute query evaluation with required arguments', async () => {
      mockExecuteQueryEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      await command.parseAsync(['node', 'test', 'my-evaluator', 'test-query']);

      expect(mockExecuteQueryEvaluation).toHaveBeenCalledWith({
        evaluatorName: 'my-evaluator',
        queryName: 'test-query',
        responseTarget: undefined,
        timeout: undefined,
        watchTimeout: undefined,
      });
    });

    it('should execute query evaluation from stdin', async () => {
      mockExecuteQueryEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      const mockStdin = {
        isTTY: false,
        setEncoding: jest.fn(),
        on: jest.fn((event: string, callback: (data?: string) => void) => {
          if (event === 'data') {
            callback('piped-query-name');
          } else if (event === 'end') {
            callback();
          }
        }),
      };

      const originalStdin = process.stdin;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      try {
        await command.parseAsync(['node', 'test', 'my-evaluator']);

        expect(mockExecuteQueryEvaluation).toHaveBeenCalledWith({
          evaluatorName: 'my-evaluator',
          queryName: 'piped-query-name',
          responseTarget: undefined,
          timeout: undefined,
          watchTimeout: undefined,
        });
      } finally {
        Object.defineProperty(process, 'stdin', {
          value: originalStdin,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should execute query evaluation with response-target option', async () => {
      mockExecuteQueryEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      await command.parseAsync([
        'node',
        'test',
        'my-evaluator',
        'test-query',
        '--response-target',
        'agent:my-agent',
      ]);

      expect(mockExecuteQueryEvaluation).toHaveBeenCalledWith({
        evaluatorName: 'my-evaluator',
        queryName: 'test-query',
        responseTarget: 'agent:my-agent',
        timeout: undefined,
        watchTimeout: undefined,
      });
    });

    it('should execute query evaluation with all options', async () => {
      mockExecuteQueryEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      await command.parseAsync([
        'node',
        'test',
        'my-evaluator',
        'test-query',
        '--response-target',
        'agent:my-agent',
        '--timeout',
        '10m',
        '--watch-timeout',
        '11m',
      ]);

      expect(mockExecuteQueryEvaluation).toHaveBeenCalledWith({
        evaluatorName: 'my-evaluator',
        queryName: 'test-query',
        responseTarget: 'agent:my-agent',
        timeout: '10m',
        watchTimeout: '11m',
      });
    });
  });
});
