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

  it('should create an evaluation command with subcommands', () => {
    const command = createEvaluationCommand({} as any);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('evaluation');
    expect(command.description()).toBe('Execute evaluations against evaluators');

    const subcommands = command.commands;
    expect(subcommands).toHaveLength(2);
    expect(subcommands[0].name()).toBe('direct');
    expect(subcommands[1].name()).toBe('query');
  });

  describe('direct subcommand', () => {
    it('should execute direct evaluation with required options', async () => {
      mockExecuteDirectEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      await command.parseAsync([
        'node',
        'test',
        'direct',
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
        'direct',
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

  describe('query subcommand', () => {
    it('should execute query evaluation with required options', async () => {
      mockExecuteQueryEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      await command.parseAsync([
        'node',
        'test',
        'query',
        'my-evaluator',
        '--query',
        'test-query',
      ]);

      expect(mockExecuteQueryEvaluation).toHaveBeenCalledWith({
        evaluatorName: 'my-evaluator',
        queryName: 'test-query',
        responseTarget: undefined,
        timeout: undefined,
        watchTimeout: undefined,
      });
    });

    it('should execute query evaluation with response-target option', async () => {
      mockExecuteQueryEvaluation.mockResolvedValue(undefined);

      const command = createEvaluationCommand({} as any);

      await command.parseAsync([
        'node',
        'test',
        'query',
        'my-evaluator',
        '--query',
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
        'query',
        'my-evaluator',
        '--query',
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
