import chalk from 'chalk';

export type StatusType = 'success' | 'warning' | 'info' | 'error';

const output = {
  /**
   * Display a status message with flexible formatting
   */
  statusMessage(
    type: StatusType,
    title: string,
    message?: string,
    ...args: unknown[]
  ): void {
    const icons = {
      success: chalk.green('✓'),
      warning: chalk.yellow.bold('!'),
      info: chalk.blue('ℹ'),
      error: chalk.red('✗'),
    };

    const colors = {
      success: chalk.green,
      warning: chalk.yellow,
      info: chalk.blue,
      error: chalk.red,
    };

    const icon = icons[type];
    const color = colors[type];
    const logFn = type === 'error' ? console.error : console.log;

    if (message) {
      logFn(icon, color(`${title}:`), message, ...args);
    } else {
      logFn(icon, title, ...args);
    }
  },

  /**
   * Display an error message with consistent formatting
   */
  error(message: string, ...args: unknown[]): void {
    this.statusMessage('error', 'error', message, ...args);
  },

  /**
   * Display a success message with consistent formatting
   */
  success(message: string, ...args: unknown[]): void {
    this.statusMessage('success', message, undefined, ...args);
  },

  /**
   * Display an info message (indented gray text)
   */
  info(message: string, ...args: unknown[]): void {
    console.log(chalk.gray(message), ...args);
  },

  /**
   * Display a warning message with consistent formatting
   */
  warning(message: string, ...args: unknown[]): void {
    this.statusMessage('warning', 'warning', message, ...args);
  },

  /**
   * Display a status check item (like ark status format)
   * @param status - 'found', 'missing', 'warning', 'error'
   * @param label - The label to show (e.g., 'platform')
   * @param value - The value in bright white (e.g., 'python3')
   * @param details - Optional grey details
   */
  statusCheck(
    status: 'found' | 'missing' | 'warning' | 'error',
    label: string,
    value?: string,
    details?: string
  ): void {
    const icons = {
      found: chalk.green('✓'),
      missing: chalk.yellow('?'),
      warning: chalk.yellow('!'),
      error: chalk.red('✗'),
    };

    const statusText = {
      found: chalk.green(label),
      missing: chalk.yellow(label),
      warning: chalk.yellow(label),
      error: chalk.red(label),
    };

    let output = `  ${icons[status]} ${statusText[status]}`;
    if (value) {
      output += ` ${chalk.bold.white(value)}`;
    }
    if (details) {
      output += chalk.gray(` ${details}`);
    }
    console.log(output);
  },

  /**
   * Display a section header (like 'ark services:')
   */
  section(title: string): void {
    console.log(chalk.cyan.bold(`${title}:`));
  },
};

export default output;
