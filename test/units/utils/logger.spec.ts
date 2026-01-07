import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '../../../src/utils';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info', () => {
    it('should log info messages to stdout with color prefix', () => {
      Logger.info('This is an info message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        'This is an info message',
      );
    });

    it('should log info messages with additional arguments', () => {
      Logger.info('Message with data', { key: 'value' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        'Message with data',
        { key: 'value' },
      );
    });
  });

  describe('warn', () => {
    it('should log warn messages to stderr', () => {
      Logger.warn('This is a warning');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        'This is a warning',
      );
    });
  });

  describe('error', () => {
    it('should log error messages to stderr', () => {
      Logger.error('This is an error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        'This is an error',
      );
    });

    it('should log error messages with Error object', () => {
      const error = new Error('Something went wrong');
      Logger.error('Error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        'Error occurred',
        error,
      );
    });
  });

  describe('debug', () => {
    it('should NOT log debug messages when debug mode is OFF', () => {
      // Forziamo la proprietà privata statica per il test
      (Logger as any).isDebugMode = false;

      Logger.debug('Debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when debug mode is ON', () => {
      // Forziamo la proprietà privata statica per il test
      (Logger as any).isDebugMode = true;

      Logger.debug('Debug message');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        'Debug message',
      );
    });

    it('should log debug messages with objects when mode is ON', () => {
      (Logger as any).isDebugMode = true;

      Logger.debug('Debug data', { foo: 'bar' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'), 'Debug data', {
        foo: 'bar',
      });
    });
  });
});
