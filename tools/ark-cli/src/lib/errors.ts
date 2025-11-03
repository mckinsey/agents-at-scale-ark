/**
 * Centralized error handling for ARK CLI
 */

import chalk from 'chalk';
import fs from 'fs';

export const ExitCodes = {
  Success: 0,
  CliError: 1,
  OperationError: 2,
  Timeout: 3,
  EvaluationFailed: 4,
} as const;

export enum ErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TEMPLATE_ERROR = 'TEMPLATE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
  PROJECT_STRUCTURE_INVALID = 'PROJECT_STRUCTURE_INVALID',
  GENERATION_FAILED = 'GENERATION_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class ArkError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly suggestions?: string[];

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    details?: Record<string, unknown>,
    suggestions?: string[]
  ) {
    super(message);
    this.name = 'ArkError';
    this.code = code;
    this.details = details;
    this.suggestions = suggestions;
  }
}

export class ValidationError extends ArkError {
  constructor(message: string, field?: string, suggestions?: string[]) {
    super(
      message,
      ErrorCode.VALIDATION_ERROR,
      field ? {field} : undefined,
      suggestions
    );
    this.name = 'ValidationError';
  }
}

export class TemplateError extends ArkError {
  constructor(message: string, templatePath?: string, suggestions?: string[]) {
    super(
      message,
      ErrorCode.TEMPLATE_ERROR,
      templatePath ? {templatePath} : undefined,
      suggestions
    );
    this.name = 'TemplateError';
  }
}

export class ProjectStructureError extends ArkError {
  constructor(message: string, projectPath?: string, suggestions?: string[]) {
    super(
      message,
      ErrorCode.PROJECT_STRUCTURE_INVALID,
      projectPath ? {projectPath} : undefined,
      suggestions || [
        'Ensure you are in a valid ARK project directory',
        'Run "ark generate project" to create a new project',
        'Check that Chart.yaml and agents/ directory exist',
      ]
    );
    this.name = 'ProjectStructureError';
  }
}

export class ErrorHandler {
  /**
   * Format and display an error with helpful context
   */
  static formatError(error: Error | ArkError): string {
    const lines: string[] = [];

    // Error header
    lines.push(chalk.red(`❌ ${error.message}`));

    // Add error details if available
    if (error instanceof ArkError) {
      if (error.details) {
        lines.push('');
        lines.push(chalk.gray('Details:'));
        for (const [key, value] of Object.entries(error.details)) {
          lines.push(chalk.gray(`  ${key}: ${value}`));
        }
      }

      // Add suggestions if available
      if (error.suggestions && error.suggestions.length > 0) {
        lines.push('');
        lines.push(chalk.yellow('💡 Suggestions:'));
        error.suggestions.forEach((suggestion) => {
          lines.push(chalk.yellow(`  • ${suggestion}`));
        });
      }
    }

    // Add stack trace in debug mode
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      lines.push('');
      lines.push(chalk.gray('Stack trace:'));
      lines.push(chalk.gray(error.stack || 'No stack trace available'));
    }

    return lines.join('\n');
  }

  /**
   * Handle and exit with appropriate error code
   */
  static handleAndExit(error: Error | ArkError): never {
    console.error('\n' + this.formatError(error));

    // Exit with appropriate code
    if (error instanceof ArkError) {
      switch (error.code) {
        case ErrorCode.INVALID_INPUT:
        case ErrorCode.VALIDATION_ERROR:
          process.exit(22); // EINVAL
          break;
        case ErrorCode.FILE_NOT_FOUND:
          process.exit(2); // ENOENT
          break;
        case ErrorCode.PERMISSION_DENIED:
          process.exit(13); // EACCES
          break;
        case ErrorCode.DEPENDENCY_MISSING:
          process.exit(127); // Command not found
          break;
        default:
          process.exit(1);
      }
    }

    process.exit(1);
  }

  /**
   * Wrap async functions with error handling
   */
  static async catchAndHandle<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ArkError) {
        throw error;
      }

      // Convert generic errors to ArkError with context
      const errorText = error instanceof Error ? error.message : String(error);
      const message = context ? `${context}: ${errorText}` : errorText;

      throw new ArkError(message, ErrorCode.UNKNOWN_ERROR);
    }
  }

  /**
   * Validate required dependencies and throw helpful errors
   */
  static async validateDependency(
    command: string,
    purpose: string,
    installInstructions?: string
  ): Promise<void> {
    try {
      const {execa} = await import('execa');
      await execa(command, ['--version'], {stdio: 'ignore'});
    } catch {
      const suggestions = [];
      if (installInstructions) {
        suggestions.push(installInstructions);
      }
      suggestions.push(
        `Visit the official ${command} documentation for installation instructions`
      );

      throw new ArkError(
        `${command} is required for ${purpose} but was not found`,
        ErrorCode.DEPENDENCY_MISSING,
        {command, purpose},
        suggestions
      );
    }
  }
}

/**
 * Input validation utilities with better error messages
 */
export class InputValidator {
  static validateName(name: string, type: string = 'name'): void {
    if (!name || name.trim().length === 0) {
      throw new ValidationError(`${type} cannot be empty`, 'name', [
        `Provide a valid ${type}`,
      ]);
    }

    const trimmed = name.trim();

    if (trimmed.length > 63) {
      throw new ValidationError(
        `${type} must be 63 characters or less (got ${trimmed.length})`,
        'name',
        [`Shorten the ${type} to 63 characters or less`]
      );
    }

    // Kubernetes name validation
    const kebabRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!kebabRegex.test(trimmed)) {
      const suggestions = [];
      const normalized = trimmed
        .replace(/([a-z])([A-Z])/g, '$1-$2') // Handle camelCase first
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/-{2,}/g, '-') // Replace 2+ consecutive hyphens with single hyphen (ReDoS-safe)
        .replace(/^-/, '') // Remove single leading hyphen (ReDoS-safe)
        .replace(/-$/, ''); // Remove single trailing hyphen (ReDoS-safe)

      if (normalized !== trimmed) {
        suggestions.push(`Try: "${normalized}"`);
      }
      suggestions.push(
        `${type} must be lowercase letters, numbers, and hyphens only`
      );
      suggestions.push(`${type} cannot start or end with a hyphen`);

      throw new ValidationError(
        `Invalid ${type}: "${trimmed}"`,
        'name',
        suggestions
      );
    }
  }

  static validatePath(path: string, type: string = 'path'): void {
    if (!path || path.trim().length === 0) {
      throw new ValidationError(`${type} cannot be empty`, 'path');
    }

    // Check for potentially dangerous paths
    const dangerous = ['..', '~', '$'];
    if (dangerous.some((pattern) => path.includes(pattern))) {
      throw new ValidationError(
        `${type} contains potentially unsafe characters`,
        'path',
        [
          'Use absolute paths or simple relative paths',
          'Avoid parent directory references (..)',
          'Avoid shell variables and special characters',
        ]
      );
    }
  }

  static validateDirectory(
    dirPath: string,
    shouldExist: boolean = false
  ): void {
    this.validatePath(dirPath, 'directory');

    if (shouldExist) {
      if (!fs.existsSync(dirPath)) {
        throw new ValidationError(
          `Directory does not exist: ${dirPath}`,
          'directory',
          [
            'Create the directory first',
            'Check the path spelling',
            'Ensure you have read permissions',
          ]
        );
      }

      if (!fs.statSync(dirPath).isDirectory()) {
        throw new ValidationError(
          `Path exists but is not a directory: ${dirPath}`,
          'directory'
        );
      }
    }
  }
}
