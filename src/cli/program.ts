import { Command, CommanderError } from 'commander';

import { version } from '../../package.json';
import { GenerateCommand } from './commands';
import { CommandConfig, CommandHandler, ProgramConfig } from './types';

/**
 * Default configuration for the CLI program.
 */
const defaultProgramConfig: ProgramConfig = {
  name: 'nog-cli',
  description:
    'nog-cli - NestJS OpenAPI Generator CLI: Generate NestJS services, interfaces and modules from OpenAPI specifications',
  version,
  skipExit: false,
};

/**
 * CLI Program Orchestrator.
 * * Manages the registration of commands, arguments parsing, and execution delegation.
 * It wraps the `commander` library to provide a strictly typed and consistent interface.
 */
export class Program {
  private readonly cli: Command;
  private readonly config: ProgramConfig;

  /**
   * Creates a new instance of the CLI Program.
   * @param config - Optional configuration overrides.
   */
  constructor(config: Partial<ProgramConfig> = {}) {
    this.config = { ...defaultProgramConfig, ...config };
    this.cli = new Command();

    this.initializeProgram();
    this.registerCommands();
  }

  /**
   * Configures the base Commander instance (name, version, output streams).
   */
  private initializeProgram(): void {
    this.cli
      .name(this.config.name)
      .description(this.config.description)
      .version(this.config.version)
      .configureOutput({
        writeOut: (str) => process.stdout.write(str),
        writeErr: (str) => process.stderr.write(str),
      });

    if (this.config.skipExit) {
      this.cli.exitOverride();
    }
  }

  /**
   * Registers the core commands available in the CLI.
   */
  private registerCommands(): void {
    // Register the generate command
    this.registerCommand(new GenerateCommand());
  }

  /**
   * Registers a generic command handler into the program.
   * * @param handler - The command handler instance implementing the specific logic.
   * @returns The Program instance for method chaining.
   */
  registerCommand<TOptions>(handler: CommandHandler<TOptions>): this {
    const config = handler.getConfig();
    this.addCommandToProgram(config);
    return this;
  }

  /**
   * Binds a command configuration to the Commander instance.
   * Maps arguments, options, and the async action handler.
   */
  private addCommandToProgram<TOptions>(config: CommandConfig<TOptions>): void {
    const command = this.cli.command(config.name).description(config.description);

    // Register Arguments
    if (config.arguments) {
      for (const arg of config.arguments) {
        command.argument(arg.name, arg.description, arg.defaultValue);
      }
    }

    // Register Options
    if (config.options) {
      for (const opt of config.options) {
        if (opt.defaultValue !== undefined) {
          command.option(opt.flags, opt.description, opt.defaultValue as string);
        } else {
          command.option(opt.flags, opt.description);
        }
      }
    }

    // Bind Action
    // We do NOT try/catch here. We let errors bubble up to main.ts for global handling.
    command.action(async (...actionArgs: unknown[]) => {
      // Commander passes variable args: (...declaredArgs, options, command)
      // We extract them safely from the end of the array
      // 1. The last argument is always the Commander object
      // 2. The second to last is the options object
      const options = actionArgs[actionArgs.length - 2] as TOptions;

      // 3. Everything before options are the positional arguments
      const args = actionArgs.slice(0, -2) as string[];

      await config.action(args, options);
    });
  }

  /**
   * Parses the command line arguments and executes the matched command.
   * * @param argv - The arguments array (defaults to process.argv).
   * @returns A promise that resolves when the command execution is complete.
   */
  public async parse(argv?: string[]): Promise<void> {
    try {
      // We use parseAsync to ensure async commands (file generation) complete
      // before the method returns.
      await this.cli.parseAsync(argv);
    } catch (error) {
      // Handle Commander-specific "soft" errors only when skipExit is enabled
      if (this.config.skipExit && error instanceof CommanderError) {
        if (
          error.code === 'commander.helpDisplayed' ||
          error.code === 'commander.versionDisplayed'
        ) {
          process.exit(0);
        }

        // For incorrect usage (missing arg, unknown option), exit with error code
        if (
          error.code === 'commander.unknownOption' ||
          error.code === 'commander.missingArgument'
        ) {
          process.exit(error.exitCode);
        }
      }

      // If it's a real runtime error (e.g., File Write Error), rethrow it.
      // main.ts will catch it and log it with Logger.error.
      throw error;
    }
  }
}
