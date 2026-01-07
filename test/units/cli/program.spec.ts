import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { version as packageVersion } from '../../../package.json';

interface MockCommander {
  name: ReturnType<typeof vi.fn>;
  description: ReturnType<typeof vi.fn>;
  version: ReturnType<typeof vi.fn>;
  exitOverride: ReturnType<typeof vi.fn>;
  configureOutput: ReturnType<typeof vi.fn>;
  command: ReturnType<typeof vi.fn>;
  parseAsync: ReturnType<typeof vi.fn>;
}

interface MockSubCommand {
  description: ReturnType<typeof vi.fn>;
  argument: ReturnType<typeof vi.fn>;
  option: ReturnType<typeof vi.fn>;
  action: ReturnType<typeof vi.fn>;
}

let latestCommanderInstance: MockCommander;
let latestSubCommandInstance: MockSubCommand;

/**
 * Provides a Commander mock with chainable methods to capture configuration calls without executing CLI logic.
 */
vi.mock('commander', () => {
  const createSubCommand = (): MockSubCommand => {
    const subCommand: MockSubCommand = {
      description: vi.fn().mockReturnThis(),
      argument: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      action: vi.fn().mockReturnThis(),
    };

    latestSubCommandInstance = subCommand;
    return subCommand;
  };

  const createCommand = (): MockCommander => {
    const subCommand = createSubCommand();

    const command: MockCommander = {
      name: vi.fn().mockReturnThis(),
      description: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
      exitOverride: vi.fn().mockReturnThis(),
      configureOutput: vi.fn().mockReturnThis(),
      command: vi.fn().mockReturnValue(subCommand),
      parseAsync: vi.fn().mockResolvedValue(undefined),
    };

    latestCommanderInstance = command;
    return command;
  };

  // Define local class to avoid hoisting issues with Vitest mocks.
  class MockCommanderError extends Error {
    code: string;
    exitCode: number;

    constructor(exitCode: number, code: string, message: string) {
      super(message);
      this.exitCode = exitCode;
      this.code = code;
      Object.setPrototypeOf(this, MockCommanderError.prototype);
    }
  }

  const Command = vi.fn(function CommandMock() {
    return createCommand();
  });

  return { Command, CommanderError: MockCommanderError };
});

const generateCommandMock = {
  getConfig: vi.fn(() => ({
    name: 'generate',
    description: 'mock generate command',
    action: vi.fn(),
  })),
};

vi.mock('../../../src/cli/commands', () => {
  const GenerateCommandMock = vi.fn(function GenerateCommandMock() {
    return generateCommandMock;
  });

  return {
    GenerateCommand: GenerateCommandMock,
  };
});

describe('Program', () => {
  let exitSpy: MockInstance;
  let ProgramModule: typeof import('../../../src/cli/program');
  let CommandsModule: typeof import('../../../src/cli/commands');
  let CommanderModule: typeof import('commander');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    latestCommanderInstance = undefined as unknown as MockCommander;
    latestSubCommandInstance = undefined as unknown as MockSubCommand;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    CommanderModule = await import('commander');
    CommandsModule = await import('../../../src/cli/commands');
    ProgramModule = await import('../../../src/cli/program');
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('should initialize with default config', async () => {
    const { Program } = ProgramModule;
    new Program();

    expect(latestCommanderInstance.name).toHaveBeenCalledWith('nog-cli');
    expect(latestCommanderInstance.description).toHaveBeenCalledWith(
      'nog-cli - NestJS OpenAPI Generator CLI: Generate NestJS services, interfaces and modules from OpenAPI specifications',
    );
    expect(latestCommanderInstance.version).toHaveBeenCalledWith(packageVersion);
    expect(latestCommanderInstance.exitOverride).not.toHaveBeenCalled();
    expect(latestCommanderInstance.configureOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        writeOut: expect.any(Function),
        writeErr: expect.any(Function),
      }),
    );
  });

  it('should call exitOverride when skipExit is true', () => {
    const { Program } = ProgramModule;
    new Program({ skipExit: true });

    expect(latestCommanderInstance.exitOverride).toHaveBeenCalledTimes(1);
  });

  it('should NOT call exitOverride when skipExit is false', () => {
    const { Program } = ProgramModule;
    new Program({ skipExit: false });

    expect(latestCommanderInstance.exitOverride).not.toHaveBeenCalled();
  });

  it('should register default commands', () => {
    const { Program } = ProgramModule;
    const { GenerateCommand } = CommandsModule;
    new Program({ skipExit: true });

    expect(GenerateCommand).toHaveBeenCalledTimes(1);
    expect(generateCommandMock.getConfig).toHaveBeenCalledTimes(1);
    expect(latestCommanderInstance.command).toHaveBeenCalledWith('generate');
    expect(latestSubCommandInstance.description).toHaveBeenCalledWith('mock generate command');
    expect(latestSubCommandInstance.action).toHaveBeenCalledTimes(1);
  });

  it('should call parse on the commander instance', async () => {
    const { Program } = ProgramModule;
    const program = new Program({ skipExit: true });
    const argv = ['node', 'cli', 'generate'];

    await program.parse(argv);

    expect(latestCommanderInstance.parseAsync).toHaveBeenCalledTimes(1);
    expect(latestCommanderInstance.parseAsync).toHaveBeenCalledWith(argv);
  });

  it('should handle soft errors by exiting with code 0', async () => {
    const { Program } = ProgramModule;
    const { CommanderError } = CommanderModule;
    const program = new Program({ skipExit: true });
    const softError = new CommanderError(0, 'commander.helpDisplayed', 'Help shown');

    latestCommanderInstance.parseAsync.mockRejectedValueOnce(softError);

    await expect(program.parse()).rejects.toThrow(softError);

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should handle usage errors by exiting with commander exit code', async () => {
    const { Program } = ProgramModule;
    const { CommanderError } = CommanderModule;
    const program = new Program({ skipExit: true });
    const usageError = new CommanderError(2, 'commander.unknownOption', 'Unknown option');

    latestCommanderInstance.parseAsync.mockRejectedValueOnce(usageError);

    await expect(program.parse()).rejects.toThrow(usageError);

    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('should rethrow runtime errors', async () => {
    const { Program } = ProgramModule;
    const program = new Program({ skipExit: true });
    const runtimeError = new Error('Unexpected failure');

    latestCommanderInstance.parseAsync.mockRejectedValueOnce(runtimeError);

    await expect(program.parse()).rejects.toThrow(runtimeError);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should register a command with arguments and options (with and without defaults)', () => {
    const { Program } = ProgramModule;
    const program = new Program({ skipExit: true });

    const complexHandler = {
      getConfig: () => ({
        name: 'complex-cmd',
        description: 'A command with args and opts',
        arguments: [{ name: 'src', description: 'Source file' }],
        options: [
          { flags: '-f, --force', description: 'Force overwrite' },
          { flags: '-t, --type <type>', description: 'File type', defaultValue: 'json' },
        ],
        action: vi.fn(),
      }),
    };

    program.registerCommand(complexHandler);

    expect(latestSubCommandInstance.argument).toHaveBeenCalledWith('src', 'Source file', undefined);
    expect(latestSubCommandInstance.option).toHaveBeenCalledWith('-f, --force', 'Force overwrite');
    expect(latestSubCommandInstance.option).toHaveBeenCalledWith(
      '-t, --type <type>',
      'File type',
      'json',
    );
  });

  it('should correctly extract args and options in the action wrapper', async () => {
    const { Program } = ProgramModule;
    const program = new Program({ skipExit: true });
    const actionSpy = vi.fn();

    const handler = {
      getConfig: () => ({
        name: 'test-action',
        description: 'desc',
        action: actionSpy,
      }),
    };

    program.registerCommand(handler);

    const lastCall = latestSubCommandInstance.action.mock.lastCall;

    expect(lastCall).toBeDefined();

    const registeredCallback = lastCall![0];

    const mockArg1 = 'my-argument';
    const mockOptions = { verbose: true };
    const mockCommandObj = {};

    await registeredCallback(mockArg1, mockOptions, mockCommandObj);

    expect(actionSpy).toHaveBeenCalledTimes(1);
    expect(actionSpy).toHaveBeenCalledWith(['my-argument'], mockOptions);
  });

  it('should configure error output for commander', async () => {
    const { Program } = ProgramModule;

    new Program({
      name: 'test-cli',
      description: 'Test CLI',
      version: '1.0.0',
      skipExit: true,
    });

    const commanderInstance = latestCommanderInstance;

    expect(commanderInstance.configureOutput).toHaveBeenCalledTimes(1);

    const configureOutputCall = commanderInstance.configureOutput.mock.calls[0][0];
    expect(configureOutputCall).toHaveProperty('writeOut');
    expect(configureOutputCall).toHaveProperty('writeErr');

    // Verify error output function works
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    configureOutputCall.writeErr('test error');
    expect(stderrSpy).toHaveBeenCalledWith('test error');
    stderrSpy.mockRestore();
  });
});
