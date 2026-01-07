import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mocks the Program class to control the bootstrap flow without executing CLI logic.
 */
const parseMock = vi.fn<() => Promise<void>>();
const programInstanceMock = { parse: parseMock };
const Program = vi.fn(function ProgramMock() {
  return programInstanceMock;
});

/**
 * Mocks the Logger to assert error reporting during bootstrap failures.
 */
const loggerErrorMock = vi.fn();
const loggerDebugMock = vi.fn();

vi.mock('../../../src/cli/program', () => ({
  Program,
}));

vi.mock('../../../src/utils', () => ({
  Logger: {
    error: loggerErrorMock,
    debug: loggerDebugMock,
  },
}));

describe('main bootstrap', () => {
  let exitSpy: MockInstance;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('should instantiate Program and parse successfully', async () => {
    parseMock.mockResolvedValueOnce();

    await import('../../../src/main');

    const parseCall = parseMock.mock.results.at(-1)?.value;
    if (parseCall instanceof Promise) {
      await parseCall;
    }

    expect(Program).toHaveBeenCalledTimes(1);
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should log fatal errors and exit with code 1 when Program.parse fails', async () => {
    const failure = new Error('Boom');
    parseMock.mockRejectedValueOnce(failure);

    await import('../../../src/main');

    const parseCall = parseMock.mock.results.at(-1)?.value;
    if (parseCall instanceof Promise) {
      await parseCall.catch(() => undefined);
    }

    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('Fatal Error'),
      failure.message,
    );
    expect(loggerDebugMock).toHaveBeenCalledWith(
      expect.stringContaining('Stack Trace'),
      failure.stack,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should log generic error message when a non-Error object is thrown', async () => {
    const unknownError = { code: 123, raw: 'custom error' };
    parseMock.mockRejectedValueOnce(unknownError);

    await import('../../../src/main');

    const parseCall = parseMock.mock.results.at(-1)?.value;
    if (parseCall instanceof Promise) {
      await parseCall.catch(() => undefined);
    }

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Fatal Error: An unexpected error occurred',
      unknownError,
    );

    expect(loggerDebugMock).not.toHaveBeenCalled();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
