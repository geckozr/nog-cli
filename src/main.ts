#!/usr/bin/env node

import { Program } from './cli/program';
import { Logger } from './utils';

/**
 * Application Bootstrap.
 *
 * This is the entry point of the CLI. It initializes the main Program class,
 * triggers the argument parsing, and provides a global exception handler
 * to ensure errors are reported gracefully to the user.
 */
async function bootstrap() {
  try {
    const program = new Program();

    await program.parse();
  } catch (error) {
    if (error instanceof Error) {
      Logger.error('Fatal Error:', error.message);
      Logger.debug('Stack Trace:', error.stack);
    } else {
      Logger.error('Fatal Error: An unexpected error occurred', error);
    }

    process.exit(1);
  }
}

bootstrap();
