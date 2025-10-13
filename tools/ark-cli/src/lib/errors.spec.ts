import {describe, it, expect, jest, beforeEach, afterEach} from '@jest/globals';
import {
  ErrorCode,
  ArkError,
  ValidationError,
  TemplateError,
  ProjectStructureError,
  ErrorHandler,
  InputValidator,
} from './errors.js';

jest.mock('fs');

describe('Error Classes', () => {
  describe('ArkError', () => {
    it('creates error with default code', () => {
      const error = new ArkError('test message');
      expect(error.message).toBe('test message');
      expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(error.name).toBe('ArkError');
      expect(error.details).toBeUndefined();
      expect(error.suggestions).toBeUndefined();
    });

    it('creates error with all properties', () => {
      const error = new ArkError(
        'test error',
        ErrorCode.INVALID_INPUT,
        {field: 'name'},
        ['Check the input', 'Try again']
      );
      expect(error.message).toBe('test error');
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(error.details).toEqual({field: 'name'});
      expect(error.suggestions).toEqual(['Check the input', 'Try again']);
    });
  });

  describe('ValidationError', () => {
    it('creates validation error without field', () => {
      const error = new ValidationError('validation failed');
      expect(error.message).toBe('validation failed');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.name).toBe('ValidationError');
      expect(error.details).toBeUndefined();
    });

    it('creates validation error with field and suggestions', () => {
      const error = new ValidationError('invalid email', 'email', [
        'Use valid format',
      ]);
      expect(error.message).toBe('invalid email');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.details).toEqual({field: 'email'});
      expect(error.suggestions).toEqual(['Use valid format']);
    });
  });

  describe('TemplateError', () => {
    it('creates template error', () => {
      const error = new TemplateError('template failed', 'template.yaml');
      expect(error.message).toBe('template failed');
      expect(error.code).toBe(ErrorCode.TEMPLATE_ERROR);
      expect(error.name).toBe('TemplateError');
      expect(error.details).toEqual({templatePath: 'template.yaml'});
    });
  });

  describe('ProjectStructureError', () => {
    it('creates project structure error with defaults', () => {
      const error = new ProjectStructureError('project invalid');
      expect(error.message).toBe('project invalid');
      expect(error.code).toBe(ErrorCode.PROJECT_STRUCTURE_INVALID);
      expect(error.name).toBe('ProjectStructureError');
      expect(error.suggestions).toEqual([
        'Ensure you are in a valid ARK project directory',
        'Run "ark generate project" to create a new project',
        'Check that Chart.yaml and agents/ directory exist',
      ]);
    });

    it('creates project structure error with path', () => {
      const error = new ProjectStructureError(
        'project invalid',
        '/path/to/project'
      );
      expect(error.message).toBe('project invalid');
      expect(error.code).toBe(ErrorCode.PROJECT_STRUCTURE_INVALID);
      expect(error.details).toEqual({projectPath: '/path/to/project'});
    });
  });

  describe('ErrorHandler', () => {
    it('formats basic error', () => {
      const error = new Error('simple error');
      const formatted = ErrorHandler.formatError(error);
      expect(formatted).toContain('❌ simple error');
    });

    it('formats ArkError with details and suggestions', () => {
      const error = new ArkError(
        'test error',
        ErrorCode.INVALID_INPUT,
        {field: 'name', value: 'test'},
        ['Fix the input', 'Try again']
      );
      const formatted = ErrorHandler.formatError(error);
      expect(formatted).toContain('❌ test error');
      expect(formatted).toContain('Details:');
      expect(formatted).toContain('field: name');
      expect(formatted).toContain('value: test');
      expect(formatted).toContain('💡 Suggestions:');
      expect(formatted).toContain('• Fix the input');
      expect(formatted).toContain('• Try again');
    });

    it('includes stack trace in debug mode', () => {
      process.env.DEBUG = 'true';
      const error = new Error('debug error');
      const formatted = ErrorHandler.formatError(error);
      expect(formatted).toContain('Stack trace:');
      delete process.env.DEBUG;
    });

    it('handles missing stack trace', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('no stack');
      error.stack = undefined;
      const formatted = ErrorHandler.formatError(error);
      expect(formatted).toContain('No stack trace available');
      delete process.env.NODE_ENV;
    });

    describe('handleAndExit', () => {
      let mockExit: jest.SpiedFunction<typeof process.exit>;
      let mockConsoleError: jest.SpiedFunction<typeof console.error>;

      beforeEach(() => {
        mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit');
        });
        mockConsoleError = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
      });

      afterEach(() => {
        mockExit.mockRestore();
        mockConsoleError.mockRestore();
      });

      it('exits with code 22 for validation errors', () => {
        const error = new ValidationError('invalid');
        expect(() => ErrorHandler.handleAndExit(error)).toThrow('process.exit');
        expect(mockExit).toHaveBeenCalledWith(22);
      });

      it('exits with code 2 for file not found', () => {
        const error = new ArkError('not found', ErrorCode.FILE_NOT_FOUND);
        expect(() => ErrorHandler.handleAndExit(error)).toThrow('process.exit');
        expect(mockExit).toHaveBeenCalledWith(2);
      });

      it('exits with code 13 for permission denied', () => {
        const error = new ArkError('denied', ErrorCode.PERMISSION_DENIED);
        expect(() => ErrorHandler.handleAndExit(error)).toThrow('process.exit');
        expect(mockExit).toHaveBeenCalledWith(13);
      });

      it('exits with code 127 for missing dependency', () => {
        const error = new ArkError('missing', ErrorCode.DEPENDENCY_MISSING);
        expect(() => ErrorHandler.handleAndExit(error)).toThrow('process.exit');
        expect(mockExit).toHaveBeenCalledWith(127);
      });

      it('exits with code 1 for unknown errors', () => {
        const error = new Error('unknown');
        expect(() => ErrorHandler.handleAndExit(error)).toThrow('process.exit');
        expect(mockExit).toHaveBeenCalledWith(1);
      });

      it('exits with code 1 for default ArkError', () => {
        const error = new ArkError('general', ErrorCode.UNKNOWN_ERROR);
        expect(() => ErrorHandler.handleAndExit(error)).toThrow('process.exit');
        expect(mockExit).toHaveBeenCalledWith(1);
      });
    });

    describe('catchAndHandle', () => {
      it('returns successful promise result', async () => {
        const result = await ErrorHandler.catchAndHandle(async () => 'success');
        expect(result).toBe('success');
      });

      it('rethrows ArkError unchanged', async () => {
        const arkError = new ValidationError('test');
        await expect(
          ErrorHandler.catchAndHandle(async () => {
            throw arkError;
          })
        ).rejects.toThrow(arkError);
      });

      it('wraps generic errors with context', async () => {
        const error = new Error('generic');
        await expect(
          ErrorHandler.catchAndHandle(async () => {
            throw error;
          }, 'context')
        ).rejects.toThrow('context: generic');
      });

      it('wraps non-Error objects', async () => {
        await expect(
          ErrorHandler.catchAndHandle(async () => {
            throw 'string error';
          })
        ).rejects.toThrow('string error');
      });
    });
  });

  describe('InputValidator', () => {
    describe('validateName', () => {
      it('accepts valid names', () => {
        expect(() => InputValidator.validateName('valid-name')).not.toThrow();
        expect(() => InputValidator.validateName('test123')).not.toThrow();
        expect(() => InputValidator.validateName('a-b-c-123')).not.toThrow();
      });

      it('rejects empty names', () => {
        expect(() => InputValidator.validateName('')).toThrow(
          'name cannot be empty'
        );
        expect(() => InputValidator.validateName('   ')).toThrow(
          'name cannot be empty'
        );
      });

      it('rejects names over 63 characters', () => {
        const longName = 'a'.repeat(64);
        expect(() => InputValidator.validateName(longName)).toThrow(
          'must be 63 characters or less'
        );
      });

      it('rejects invalid characters', () => {
        expect(() => InputValidator.validateName('Invalid Name')).toThrow(
          'Invalid name'
        );
        expect(() => InputValidator.validateName('test_name')).toThrow(
          'Invalid name'
        );
        expect(() => InputValidator.validateName('-start')).toThrow(
          'Invalid name'
        );
        expect(() => InputValidator.validateName('end-')).toThrow(
          'Invalid name'
        );
      });

      it('suggests normalized names', () => {
        try {
          InputValidator.validateName('TestName');
        } catch (e: any) {
          expect(e.suggestions).toContain('Try: "test-name"');
        }
      });
    });

    describe('validatePath', () => {
      it('accepts valid paths', () => {
        expect(() => InputValidator.validatePath('/valid/path')).not.toThrow();
        expect(() => InputValidator.validatePath('./relative')).not.toThrow();
        expect(() => InputValidator.validatePath('simple')).not.toThrow();
      });

      it('rejects empty paths', () => {
        expect(() => InputValidator.validatePath('')).toThrow(
          'path cannot be empty'
        );
      });

      it('rejects dangerous paths', () => {
        expect(() => InputValidator.validatePath('../parent')).toThrow(
          'unsafe characters'
        );
        expect(() => InputValidator.validatePath('~/home')).toThrow(
          'unsafe characters'
        );
        expect(() => InputValidator.validatePath('$HOME/test')).toThrow(
          'unsafe characters'
        );
      });
    });

    describe('validateDirectory', () => {
      it('validates path first', () => {
        expect(() => InputValidator.validateDirectory('')).toThrow(
          'directory cannot be empty'
        );
      });
    });
  });
});
