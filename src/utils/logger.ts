import chalk from 'chalk';

/**
 * Global Logger utility for the CLI.
 * Wraps standard console methods to provide consistent, color-coded formatting and log levels.
 *
 * It handles output streams correctly:
 * - `stdout`: for INFO and DEBUG messages.
 * - `stderr`: for WARN and ERROR messages.
 *
 * @class
 */
export class Logger {
  /**
   * Internal flag to cache the debug state.
   * Prevents accessing `process.env` on every log call, improving performance in tight loops.
   *
   * @private
   * @readonly
   */
  private static readonly isDebugMode = !!process.env.DEBUG;

  /**
   * Logs a general informational message to stdout.
   * Use this for standard feedback to the user (e.g., "File created successfully").
   *
   * **Color:** Cyan tag `[INFO]`
   *
   * @param {string} message - The main message to log.
   * @param {...unknown[]} optionalArgs - Additional arguments, objects, or arrays to inspect.
   */
  static info(message: string, ...optionalArgs: unknown[]): void {
    console.log(chalk.cyan('[INFO]'), message, ...optionalArgs);
  }

  /**
   * Logs a warning message to stderr.
   * Use this for non-critical issues or potential problems that do not halt execution
   * (e.g., "Configuration file missing, using defaults").
   *
   * **Color:** Yellow tag `[WARN]`
   *
   * @param {string} message - The warning message.
   * @param {...unknown[]} optionalArgs - Additional context or data.
   */
  static warn(message: string, ...optionalArgs: unknown[]): void {
    console.warn(chalk.yellow('[WARN]'), message, ...optionalArgs);
  }

  /**
   * Logs an error message to stderr.
   * Use this for critical failures that prevent an operation from completing
   * (e.g., "Failed to parse schema", "Network timeout").
   *
   * **Color:** Red tag `[ERROR]`
   *
   * @param {string} message - The error message.
   * @param {...unknown[]} optionalArgs - Error objects, stack traces, or detailed failure info.
   */
  static error(message: string, ...optionalArgs: unknown[]): void {
    console.error(chalk.red('[ERROR]'), message, ...optionalArgs);
  }

  /**
   * Logs a debug message to stdout, ONLY if the `DEBUG` environment variable is set.
   * Use this for internal developer details useful for troubleshooting logic
   * (e.g., "Parsed IR model state:", object dumps).
   *
   * **Color:** Gray tag `[DEBUG]`
   *
   * @param {string} message - The debug note.
   * @param {...unknown[]} optionalArgs - Raw objects or arrays for deep inspection.
   */
  static debug(message: string, ...optionalArgs: unknown[]): void {
    if (this.isDebugMode) {
      // Using .log for debug to keep it on stdout
      console.log(chalk.gray('[DEBUG]'), message, ...optionalArgs);
    }
  }
}
