import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneratorEngine } from '../../src/core/generator/engine';
import { IrDefinition } from '../../src/core/ir/interfaces/index';

/**
 * Hoisted mocks to enable access within vi.mock factories (prevents out-of-scope variable errors).
 */
const mocks = vi.hoisted(() => ({
  projectSave: vi.fn(),
  dtoWriteAll: vi.fn(),
  serviceWriteAll: vi.fn(),
  moduleWrite: vi.fn(),
  indexWrite: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

/**
 * Mock ts-morph Project and compiler/manipulation settings.
 */
vi.mock('ts-morph', () => {
  return {
    Project: vi.fn(function ProjectMock() {
      return {
        save: mocks.projectSave,
      };
    }),
    IndentationText: { TwoSpaces: '  ' },
    QuoteKind: { Single: "'" },
    ScriptTarget: { ESNext: 99 },
    ModuleKind: { CommonJS: 1 },
  };
});

/**
 * Mock DtoWriter with hoisted spy.
 */
vi.mock('../../src/core/generator/writers/dto.writer', () => ({
  DtoWriter: vi.fn(function DtoWriterMock() {
    return {
      writeAll: mocks.dtoWriteAll,
    };
  }),
}));

/**
 * Mock ServiceWriter with hoisted spy.
 */
vi.mock('../../src/core/generator/writers/service.writer', () => ({
  ServiceWriter: vi.fn(function ServiceWriterMock() {
    return {
      writeAll: mocks.serviceWriteAll,
    };
  }),
}));

/**
 * Mock ModuleWriter with hoisted spy.
 */
vi.mock('../../src/core/generator/writers/module.writer', () => ({
  ModuleWriter: vi.fn(function ModuleWriterMock() {
    return {
      write: mocks.moduleWrite,
    };
  }),
}));

/**
 * Mock IndexWriter with hoisted spy.
 */
vi.mock('../../src/core/generator/writers/index.writer', () => ({
  IndexWriter: vi.fn(function IndexWriterMock() {
    return {
      write: mocks.indexWrite,
    };
  }),
}));

/**
 * Mock Logger with hoisted spies.
 */
vi.mock('../../src/utils/logger', () => ({
  Logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  },
}));

describe('GeneratorEngine', () => {
  const mockOutputDir = '/tmp/output';

  /**
   * Minimal IR mock sufficient for engine passthrough testing.
   */
  const mockIr: IrDefinition = {
    models: [{ name: 'TestDto', fileName: 'test-dto', isEnum: false, properties: [] }],
    services: [{ name: 'TestService', operations: new Map() }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize project with correct configuration', () => {
    const engine = new GeneratorEngine(mockOutputDir);
    expect(engine.getProject()).toBeDefined();
  });

  it('should execute generation steps in correct order', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(mockIr);

    expect(mocks.dtoWriteAll).toHaveBeenCalledWith(mockIr.models);
    expect(mocks.serviceWriteAll).toHaveBeenCalledWith(mockIr.services);
    expect(mocks.moduleWrite).toHaveBeenCalledWith(mockIr);
    expect(mocks.indexWrite).toHaveBeenCalledWith(mockIr);
    expect(mocks.projectSave).toHaveBeenCalled();

    /**
     * Verify the order of execution: DTOs → Services → Module → Index → Save.
     */
    const dtoOrder = mocks.dtoWriteAll.mock.invocationCallOrder[0];
    const serviceOrder = mocks.serviceWriteAll.mock.invocationCallOrder[0];
    const moduleOrder = mocks.moduleWrite.mock.invocationCallOrder[0];
    const indexOrder = mocks.indexWrite.mock.invocationCallOrder[0];
    const saveOrder = mocks.projectSave.mock.invocationCallOrder[0];

    expect(dtoOrder).toBeLessThan(serviceOrder);
    expect(serviceOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(indexOrder);
    expect(indexOrder).toBeLessThan(saveOrder);
  });

  it('should use custom module name from config', async () => {
    const engine = new GeneratorEngine(mockOutputDir, { moduleName: 'CustomModule' });
    await engine.generate(mockIr);

    const { ModuleWriter } = await import('../../src/core/generator/writers/module.writer');
    expect(ModuleWriter).toHaveBeenCalledWith(
      expect.anything(),
      mockOutputDir,
      'CustomModule',
      'Unknown Spec',
      'Unknown Version',
    );
  });

  it('should handle errors and log them', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    const error = new Error('Write failed');

    mocks.dtoWriteAll.mockRejectedValueOnce(error);

    await expect(engine.generate(mockIr)).rejects.toThrow('Write failed');

    expect(mocks.loggerError).toHaveBeenCalledWith('Code generation failed:', error);
  });
});
