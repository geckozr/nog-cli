import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneratorEngine } from '../../../src/core/generator/engine';
import { IrDefinition } from '../../../src/core/ir/interfaces/index';

const mocks = vi.hoisted(() => ({
  dtoWrite: vi.fn().mockResolvedValue({ filename: 'test.dto.ts', generatedCode: '' }),
  serviceWrite: vi.fn().mockResolvedValue({ filename: 'test.service.ts', generatedCode: '' }),
  apiTypesWrite: vi.fn().mockResolvedValue({ filename: 'api.types.ts', generatedCode: '' }),
  apiConfigurationWrite: vi
    .fn()
    .mockResolvedValue({ filename: 'api.configuration.ts', generatedCode: '' }),
  requestBuilderWrite: vi
    .fn()
    .mockResolvedValue({ filename: 'request-builder.service.ts', generatedCode: '' }),
  apiModuleWrite: vi.fn().mockResolvedValue({ filename: 'api.module.ts', generatedCode: '' }),
  indexGenerate: vi.fn().mockResolvedValue({ filename: 'index.ts', generatedCode: '' }),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../src/core/generator/writers/dto.writer', () => ({
  DtoWriter: vi.fn(function DtoWriterMock() {
    return { write: mocks.dtoWrite };
  }),
}));

vi.mock('../../../src/core/generator/writers/service.writer', () => ({
  ServiceWriter: vi.fn(function ServiceWriterMock() {
    return { write: mocks.serviceWrite };
  }),
}));

vi.mock('../../../src/core/generator/writers/index.writer', () => ({
  IndexWriter: vi.fn(function IndexWriterMock() {
    return { generate: mocks.indexGenerate };
  }),
}));

vi.mock('../../../src/core/generator/writers/api-types.writer', () => ({
  ApiTypesWriter: vi.fn(function ApiTypesWriterMock() {
    return { write: mocks.apiTypesWrite };
  }),
}));

vi.mock('../../../src/core/generator/writers/api-configuration.writer', () => ({
  ApiConfigurationWriter: vi.fn(function ApiConfigurationWriterMock() {
    return { write: mocks.apiConfigurationWrite };
  }),
}));

vi.mock('../../../src/core/generator/writers/request-builder.writer', () => ({
  RequestBuilderWriter: vi.fn(function RequestBuilderWriterMock() {
    return { write: mocks.requestBuilderWrite };
  }),
}));

vi.mock('../../../src/core/generator/writers/api-module.writer', () => ({
  ApiModuleWriter: vi.fn(function ApiModuleWriterMock() {
    return { write: mocks.apiModuleWrite };
  }),
}));

vi.mock('fs', () => ({
  mkdirSync: mocks.mkdirSync,
  writeFileSync: mocks.writeFileSync,
}));

vi.mock('../../../src/utils/logger', () => ({
  Logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  },
}));

describe('GeneratorEngine', () => {
  const mockOutputDir = '/tmp/output';

  const mockIr: IrDefinition = {
    models: [{ name: 'TestDto', fileName: 'test-dto', isEnum: false, properties: [] }],
    services: [{ name: 'TestService', fileName: 'test.service', operations: new Map() }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call DTO writer once per model and service writer once per service', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(mockIr);

    expect(mocks.dtoWrite).toHaveBeenCalledTimes(mockIr.models.length);
    expect(mocks.serviceWrite).toHaveBeenCalledTimes(mockIr.services.length);
  });

  it('should invoke api-types/configuration/request-builder writers with cliVersion + spec metadata', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(mockIr);

    const expectedArgs = [expect.any(String), 'Unknown Spec', 'Unknown Version'];

    expect(mocks.apiTypesWrite).toHaveBeenCalledWith(...expectedArgs);
    expect(mocks.apiConfigurationWrite).toHaveBeenCalledWith(...expectedArgs);
    expect(mocks.requestBuilderWrite).toHaveBeenCalledWith(...expectedArgs);
  });

  it('should strip "Module" suffix from default moduleName when invoking api-module writer', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(mockIr);

    expect(mocks.apiModuleWrite).toHaveBeenCalledWith(
      mockIr.services,
      'Api',
      expect.any(String),
      'Unknown Spec',
      'Unknown Version',
    );
  });

  it('should strip "Module" suffix from custom moduleName when configured', async () => {
    const engine = new GeneratorEngine(mockOutputDir, { moduleName: 'CustomModule' });
    await engine.generate(mockIr);

    expect(mocks.apiModuleWrite).toHaveBeenCalledWith(
      mockIr.services,
      'Custom',
      expect.any(String),
      'Unknown Spec',
      'Unknown Version',
    );
  });

  it('should generate three barrel index files (dto, services, root) with correct exports', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(mockIr);

    expect(mocks.indexGenerate).toHaveBeenCalledTimes(3);

    expect(mocks.indexGenerate.mock.calls[0][0]).toEqual(['test-dto.dto']);
    expect(mocks.indexGenerate.mock.calls[1][0]).toEqual(['test.service']);
    expect(mocks.indexGenerate.mock.calls[2][0]).toEqual([
      'dto',
      'services',
      'api.module',
      'api.configuration',
      'api.types',
      'request-builder.service',
    ]);
  });

  it('should execute module writers in order: types -> configuration -> request-builder -> module', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(mockIr);

    const types = mocks.apiTypesWrite.mock.invocationCallOrder[0];
    const config = mocks.apiConfigurationWrite.mock.invocationCallOrder[0];
    const requestBuilder = mocks.requestBuilderWrite.mock.invocationCallOrder[0];
    const apiModule = mocks.apiModuleWrite.mock.invocationCallOrder[0];

    expect(types).toBeLessThan(config);
    expect(config).toBeLessThan(requestBuilder);
    expect(requestBuilder).toBeLessThan(apiModule);
  });

  it('should run DTOs before services, services before module writers, module writers before barrels', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(mockIr);

    const lastDto = mocks.dtoWrite.mock.invocationCallOrder.at(-1) ?? 0;
    const lastService = mocks.serviceWrite.mock.invocationCallOrder.at(-1) ?? 0;
    const firstModule = mocks.apiTypesWrite.mock.invocationCallOrder[0];
    const firstBarrel = mocks.indexGenerate.mock.invocationCallOrder[0];

    expect(lastDto).toBeLessThan(lastService);
    expect(lastService).toBeLessThan(firstModule);
    expect(firstModule).toBeLessThan(firstBarrel);
  });

  it('should pass an empty inherited-properties Set for root models without extends', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(mockIr);

    // dtoWriter.write signature: (model, allModels, inheritedProperties, cliVersion, ...)
    const inheritedSet = mocks.dtoWrite.mock.calls[0][2] as Set<string>;
    expect(inheritedSet).toBeInstanceOf(Set);
    expect(inheritedSet.size).toBe(0);
  });

  it('should collect inherited properties across a multi-level extends chain', async () => {
    const ir: IrDefinition = {
      models: [
        {
          name: 'A',
          fileName: 'a',
          isEnum: false,
          properties: [
            {
              name: 'id',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: true,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        {
          name: 'B',
          fileName: 'b',
          isEnum: false,
          extends: 'A',
          properties: [
            {
              name: 'name',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: true,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        {
          name: 'C',
          fileName: 'c',
          isEnum: false,
          extends: 'B',
          properties: [
            {
              name: 'extra',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: true,
              isReadonly: false,
              validators: [],
            },
          ],
        },
      ],
      services: [],
    };

    const engine = new GeneratorEngine(mockOutputDir);
    await engine.generate(ir);

    const setForA = mocks.dtoWrite.mock.calls[0][2] as Set<string>;
    const setForB = mocks.dtoWrite.mock.calls[1][2] as Set<string>;
    const setForC = mocks.dtoWrite.mock.calls[2][2] as Set<string>;

    expect(Array.from(setForA)).toEqual([]);
    expect(Array.from(setForB).sort()).toEqual(['id']);
    expect(Array.from(setForC).sort()).toEqual(['id', 'name']);
  });

  it('should not throw when a model extends a parent missing from the registry', async () => {
    const ir: IrDefinition = {
      models: [
        {
          name: 'Orphan',
          fileName: 'orphan',
          isEnum: false,
          extends: 'NotInRegistry',
          properties: [],
        },
      ],
      services: [],
    };

    const engine = new GeneratorEngine(mockOutputDir);
    await expect(engine.generate(ir)).resolves.not.toThrow();

    const inheritedSet = mocks.dtoWrite.mock.calls[0][2] as Set<string>;
    expect(inheritedSet.size).toBe(0);
  });

  it('should propagate errors from writers and log them', async () => {
    const engine = new GeneratorEngine(mockOutputDir);
    const error = new Error('Write failed');

    mocks.dtoWrite.mockRejectedValueOnce(error);

    await expect(engine.generate(mockIr)).rejects.toThrow('Write failed');

    expect(mocks.loggerError).toHaveBeenCalledWith('Code generation failed:', error);
  });
});
