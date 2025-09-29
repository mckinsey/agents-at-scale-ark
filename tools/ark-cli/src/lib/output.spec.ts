import {describe, it, expect, beforeEach, afterEach, jest} from '@jest/globals';
import chalk from 'chalk';
import output from './output.js';

describe('output', () => {
  let consoleErrorSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined as any);
    consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('error', () => {
    it('should output error message with red cross and prefix', () => {
      output.error('Something went wrong');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('✗'),
        chalk.red('error:'),
        'Something went wrong'
      );
    });

    it('should handle additional arguments', () => {
      const error = new Error('Test error');
      output.error('Failed to connect', error, 123);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('✗'),
        chalk.red('error:'),
        'Failed to connect',
        error,
        123
      );
    });
  });

  describe('success', () => {
    it('should output success message with green checkmark', () => {
      output.success('Operation completed');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✓'),
        'Operation completed'
      );
    });

    it('should handle additional arguments', () => {
      output.success('Deployed', 'v1.0.0', {status: 'ok'});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✓'),
        'Deployed',
        'v1.0.0',
        {status: 'ok'}
      );
    });
  });

  describe('info', () => {
    it('should output info message in gray', () => {
      output.info('Processing request...');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('Processing request...')
      );
    });

    it('should handle additional arguments', () => {
      output.info('Status:', 'running', 42);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('Status:'),
        'running',
        42
      );
    });
  });

  describe('warning', () => {
    it('should output warning message with yellow exclamation and prefix', () => {
      output.warning('Resource limit approaching');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow.bold('!'),
        chalk.yellow('warning:'),
        'Resource limit approaching'
      );
    });

    it('should handle additional arguments', () => {
      const details = {cpu: '85%', memory: '92%'};
      output.warning('High resource usage', details);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow.bold('!'),
        chalk.yellow('warning:'),
        'High resource usage',
        details
      );
    });
  });

  describe('statusCheck', () => {
    it('should display found status with value and details', () => {
      output.statusCheck('found', 'platform', 'python3', 'v3.10');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `  ${chalk.green('✓')} ${chalk.green('platform')} ${chalk.bold.white('python3')}${chalk.gray(' v3.10')}`
      );
    });

    it('should display found status with value only', () => {
      output.statusCheck('found', 'fastmcp', 'v0.1.0');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `  ${chalk.green('✓')} ${chalk.green('fastmcp')} ${chalk.bold.white('v0.1.0')}`
      );
    });

    it('should display found status with label only', () => {
      output.statusCheck('found', '3 tools');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `  ${chalk.green('✓')} ${chalk.green('3 tools')}`
      );
    });

    it('should display missing status with details', () => {
      output.statusCheck(
        'missing',
        'fastmcp',
        undefined,
        'not in dependencies'
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `  ${chalk.yellow('?')} ${chalk.yellow('fastmcp')}${chalk.gray(' not in dependencies')}`
      );
    });

    it('should display warning status', () => {
      output.statusCheck('warning', 'version', '0.0.1', 'pre-release');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `  ${chalk.yellow('!')} ${chalk.yellow('version')} ${chalk.bold.white('0.0.1')}${chalk.gray(' pre-release')}`
      );
    });

    it('should display error status', () => {
      output.statusCheck('error', 'tools', undefined, 'discovery failed');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `  ${chalk.red('✗')} ${chalk.red('tools')}${chalk.gray(' discovery failed')}`
      );
    });
  });

  describe('section', () => {
    it('should display section header with colon', () => {
      output.section('dev-tests');

      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.cyan.bold('dev-tests:'));
    });

    it('should display section header with custom text', () => {
      output.section('ark services');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.cyan.bold('ark services:')
      );
    });
  });

  describe('statusMessage', () => {
    it('should output success status with title and message', () => {
      output.statusMessage('success', 'fastmcp', 'installed (v0.1.0)');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✓'),
        chalk.green('fastmcp:'),
        'installed (v0.1.0)'
      );
    });

    it('should output warning status with title and message', () => {
      output.statusMessage('warning', 'virtual environment', 'not found');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow.bold('!'),
        chalk.yellow('virtual environment:'),
        'not found'
      );
    });

    it('should output error status with title and message', () => {
      output.statusMessage('error', 'fastmcp', 'not found in dependencies');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('✗'),
        chalk.red('fastmcp:'),
        'not found in dependencies'
      );
    });

    it('should output info status with title and message', () => {
      output.statusMessage('info', 'platform', 'python3');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.blue('ℹ'),
        chalk.blue('platform:'),
        'python3'
      );
    });

    it('should handle title-only messages', () => {
      output.statusMessage('success', 'Operation completed');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✓'),
        'Operation completed'
      );
    });

    it('should handle additional arguments', () => {
      const extra = {version: '1.0'};
      output.statusMessage('info', 'status', 'running', extra, 42);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.blue('ℹ'),
        chalk.blue('status:'),
        'running',
        extra,
        42
      );
    });
  });
});
