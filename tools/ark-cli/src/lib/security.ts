/**
 * Security utilities for ARK CLI
 */

import path from 'path';
import fs from 'fs';
import {ValidationError} from './errors.js';

export class SecurityUtils {
  /**
   * Validate that a path is safe and doesn't contain directory traversal attempts
   */
  static validatePath(filePath: string, context: string = 'path'): void {
    // Skip validation for internal template paths - they're always safe
    if (context === 'template path') {
      return;
    }

    if (!filePath || typeof filePath !== 'string') {
      throw new ValidationError(
        `Invalid ${context}: path must be a non-empty string`,
        'path',
        ['Provide a valid file path']
      );
    }

    // Normalize the path to resolve any relative components
    const normalizedPath = path.normalize(filePath);

    // Check for directory traversal attempts
    if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
      throw new ValidationError(
        `Unsafe ${context}: contains directory traversal sequences`,
        'path',
        [
          'Use absolute paths or simple relative paths',
          'Remove parent directory references (..)',
          'Remove home directory references (~)',
        ]
      );
    }

    // Check for absolute paths that go outside expected directories
    if (path.isAbsolute(normalizedPath)) {
      const dangerous = ['/etc', '/var', '/usr', '/bin', '/sbin', '/root'];
      if (
        dangerous.some((dangerousPath) =>
          normalizedPath.startsWith(dangerousPath)
        )
      ) {
        throw new ValidationError(
          `Unsafe ${context}: attempts to access system directory`,
          'path',
          [
            'Use project-relative paths',
            'Avoid system directories',
            'Use a safe working directory',
          ]
        );
      }
    }

    // Check for null bytes and other dangerous characters
    if (normalizedPath.includes('\0') || normalizedPath.includes('\u0000')) {
      throw new ValidationError(
        `Invalid ${context}: contains null bytes`,
        'path',
        ['Remove null bytes from the path']
      );
    }
  }

  /**
   * Ensure a directory path is safe to create/write to
   */
  static validateOutputPath(outputPath: string, baseDir: string): void {
    this.validatePath(outputPath, 'output path');
    this.validatePath(baseDir, 'base directory');

    const resolvedOutput = path.resolve(outputPath);
    const resolvedBase = path.resolve(baseDir);

    // Ensure the output path is within the base directory
    if (!resolvedOutput.startsWith(resolvedBase)) {
      throw new ValidationError(
        'Output path is outside the allowed directory',
        'outputPath',
        [
          `Ensure output path is within: ${resolvedBase}`,
          'Use relative paths within the project',
          'Check for directory traversal in the path',
        ]
      );
    }
  }

  /**
   * Sanitize file names to prevent issues
   */
  static sanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') {
      throw new ValidationError(
        'Invalid file name: must be a non-empty string',
        'fileName'
      );
    }

    // Standard dotfiles that should be preserved
    const allowedDotfiles = [
      '.gitignore',
      '.gitattributes',
      '.github',
      '.gitmodules',
      '.helmignore',
      '.dockerignore',
      '.eslintrc',
      '.prettierrc',
      '.editorconfig',
      '.nvmrc',
      '.yamllint.yml',
      '.yamllint.yaml',
      '.env',
      '.env.example',
      '.env.local',
      '.env.production',
      '.vscode',
      '.idea',
      '.vimrc',
      '.bashrc',
      '.zshrc',
      '.keep',
    ];

    // Check if this is an allowed dotfile
    const isAllowedDotfile = allowedDotfiles.some(
      (allowed) => fileName === allowed || fileName.startsWith(allowed + '.')
    );

    // Remove dangerous characters
    let sanitized = fileName
      .replace(/[<>:"/\\|?*]/g, '') // Windows forbidden chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-{2,}/g, '-') // Replace 2+ consecutive hyphens with single hyphen (ReDoS-safe)
      .replace(/^-/, '') // Remove single leading hyphen (ReDoS-safe)
      .replace(/-$/, ''); // Remove single trailing hyphen (ReDoS-safe)

    // Remove leading dots only if not an allowed dotfile
    if (!isAllowedDotfile) {
      sanitized = sanitized.replace(/^\\./, ''); // Remove single leading dot (ReDoS-safe)
    }

    // Ensure it's not empty after sanitization
    if (!sanitized) {
      throw new ValidationError(
        'File name becomes empty after sanitization',
        'fileName',
        ['Use alphanumeric characters and hyphens only']
      );
    }

    // Ensure it's not too long
    if (sanitized.length > 255) {
      sanitized = sanitized.substring(0, 255);
    }

    // Check for reserved names (Windows)
    const reservedNames = [
      'CON',
      'PRN',
      'AUX',
      'NUL',
      'COM1',
      'COM2',
      'COM3',
      'COM4',
      'COM5',
      'COM6',
      'COM7',
      'COM8',
      'COM9',
      'LPT1',
      'LPT2',
      'LPT3',
      'LPT4',
      'LPT5',
      'LPT6',
      'LPT7',
      'LPT8',
      'LPT9',
    ];

    if (reservedNames.includes(sanitized.toUpperCase())) {
      sanitized = `_${sanitized}`;
    }

    return sanitized;
  }

  /**
   * Validate template content to prevent code injection
   */
  static validateTemplateContent(content: string, templatePath: string): void {
    if (!content || typeof content !== 'string') {
      return; // Empty content is fine
    }

    // File types that legitimately need shell/script syntax and should skip validation
    const exemptFileTypes = [
      '.sh',
      '.bash',
      '.zsh',
      '.fish', // Shell scripts
      'Makefile',
      'makefile',
      '.mk', // Makefiles
      '.ps1',
      '.cmd',
      '.bat', // Windows scripts
      '.py',
      '.js',
      '.ts',
      '.rb',
      '.pl', // Programming languages
      '.dockerfile',
      'Dockerfile', // Docker files
      '.yml',
      '.yaml', // YAML files (may contain scripts in CI/CD)
      '.md',
      '.markdown',
      '.rst',
      '.txt', // Documentation files (may contain code examples)
    ];

    const fileName = path.basename(templatePath).toLowerCase();
    const fileExt = path.extname(templatePath).toLowerCase();

    // Skip validation for exempt file types
    if (
      exemptFileTypes.some(
        (exempt) =>
          fileName === exempt.toLowerCase() ||
          fileName.includes(exempt.toLowerCase()) ||
          fileExt === exempt.toLowerCase()
      )
    ) {
      return;
    }

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
      /\$\{[\w.]{0,100}?\([a-zA-Z0-9_.,\s]{0,100}?\)/, // Function calls in template variables (ReDoS-safe)
      /\$\([a-zA-Z0-9\s._-]{0,100}?\)/, // Command substitution (ReDoS-safe)
      /`[a-zA-Z0-9\s._${}()-]{0,500}?`/, // Backticks (ReDoS-safe)
      /eval\s*\(/, // Eval statements
      /exec\s*\(/, // Exec statements
      /require\s*\(/, // Require statements
      /\bimport\s/, // Import statements (ReDoS-safe - simple detection)
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        throw new ValidationError(
          `Template contains potentially dangerous code: ${templatePath}`,
          'templateContent',
          [
            'Remove code execution patterns from templates',
            'Use only variable substitution',
            'Check template for malicious content',
          ]
        );
      }
    }
  }

  /**
   * Safely create directories with proper permissions
   */
  static async createDirectorySafe(
    dirPath: string,
    baseDir: string
  ): Promise<void> {
    this.validateOutputPath(dirPath, baseDir);

    try {
      await fs.promises.mkdir(dirPath, {
        recursive: true,
        mode: 0o755, // Read/write/execute for owner, read/execute for group and others
      });
    } catch (error) {
      throw new ValidationError(
        `Failed to create directory: ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
        'directory',
        [
          'Check file permissions',
          'Ensure parent directory exists',
          'Verify disk space availability',
        ]
      );
    }
  }

  /**
   * Safely write files with proper permissions
   */
  static async writeFileSafe(
    filePath: string,
    content: string,
    baseDir: string
  ): Promise<void> {
    this.validateOutputPath(filePath, baseDir);
    this.validateTemplateContent(content, filePath);

    const fileName = path.basename(filePath);
    const sanitizedFileName = this.sanitizeFileName(fileName);

    if (sanitizedFileName !== fileName) {
      throw new ValidationError(
        `File name requires sanitization: "${fileName}" → "${sanitizedFileName}"`,
        'fileName',
        [`Use the sanitized name: "${sanitizedFileName}"`]
      );
    }

    try {
      await fs.promises.writeFile(filePath, content, {
        mode: 0o644, // Read/write for owner, read for group and others
        flag: 'w', // Overwrite if exists
      });
    } catch (error) {
      throw new ValidationError(
        `Failed to write file: ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        'file',
        [
          'Check file permissions',
          'Ensure directory exists',
          'Verify disk space availability',
        ]
      );
    }
  }

  /**
   * Validate environment variables for safety
   */
  static sanitizeEnvironmentValue(value: string, varName: string): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    // Remove potentially dangerous characters
    const sanitized = value
      .replace(/[`$\\]/g, '') // Command injection chars
      .trim();

    // Warn if significant changes were made
    if (sanitized !== value && sanitized.length < value.length * 0.8) {
      console.warn(
        `Warning: Environment variable ${varName} was heavily sanitized`
      );
    }

    return sanitized;
  }

  /**
   * Validate API keys and secrets
   */
  static validateSecret(secret: string, secretType: string): void {
    if (!secret || typeof secret !== 'string') {
      throw new ValidationError(
        `Invalid ${secretType}: must be a non-empty string`,
        'secret'
      );
    }

    // Check for common patterns that suggest it's not a real secret
    const testPatterns = [
      /^(test|dummy|fake|placeholder|example)/i,
      /^(xxx|000|123)/,
      /^your[_-]?key/i,
      /^replace[_-]?me/i,
    ];

    for (const pattern of testPatterns) {
      if (pattern.test(secret)) {
        throw new ValidationError(
          `${secretType} appears to be a placeholder value`,
          'secret',
          [
            `Replace with a real ${secretType}`,
            'Check your configuration',
            'Ensure secrets are properly set',
          ]
        );
      }
    }

    // Basic length validation (most API keys are at least 16 chars)
    if (secret.length < 16) {
      throw new ValidationError(
        `${secretType} appears too short (${secret.length} characters)`,
        'secret',
        [
          'Ensure you have the complete key',
          'Check for truncation',
          'Verify with your provider',
        ]
      );
    }
  }
}
