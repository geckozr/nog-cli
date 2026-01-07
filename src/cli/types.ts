/**
 * Configuration for a CLI option
 */
export interface OptionConfig {
  /** Flags definition (e.g., '-o, --output <directory>') */
  flags: string;
  /** Description shown in help */
  description: string;
  /** Default value (optional) */
  defaultValue?: string | boolean | number;
}

/**
 * Configuration for a CLI argument
 */
export interface ArgumentConfig {
  /** Argument name with syntax (e.g., '<file>' or '[file]') */
  name: string;
  /** Description shown in help */
  description: string;
  /** Default value (optional) */
  defaultValue?: string;
}

/**
 * Configuration for a CLI command
 */
export interface CommandConfig<TOptions = Record<string, unknown>> {
  /** Command name */
  name: string;
  /** Command description */
  description: string;
  /** Command arguments */
  arguments?: ArgumentConfig[];
  /** Command options */
  options?: OptionConfig[];
  /** Command action handler */
  action: (args: string[], options: TOptions) => Promise<void> | void;
}

/**
 * CLI program configuration
 */
export interface ProgramConfig {
  /** Program name */
  name: string;
  /** Program description */
  description: string;
  /** Program version */
  version: string;
  /**
   * If true, prevents Commander from calling process.exit() and instead throws errors.
   * Useful for testing but should be false in production.
   * @default false
   */
  skipExit?: boolean;
}

/**
 * Interface for command handlers
 */
export interface CommandHandler<TOptions = Record<string, unknown>> {
  /** Get the command configuration */
  getConfig(): CommandConfig<TOptions>;
}

/**
 * Factory function type for creating command handlers
 */
export type CommandFactory = () => CommandHandler;
