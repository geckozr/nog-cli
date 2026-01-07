import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TypeHelper } from '../../../src/core/generator/helpers/type.helper';
import { IndexWriter } from '../../../src/core/generator/writers/index.writer';
import { IrDefinition } from '../../../src/core/ir/interfaces';

// 1. Mock helpers
vi.mock('../../../src/core/generator/helpers/file-header.helper', () => ({
  FileHeaderHelper: {
    getHeader: () => '// Header',
    addHeader: vi.fn(),
  },
}));
vi.mock('../../../src/core/generator/helpers/type.helper');

describe('IndexWriter', () => {
  let projectMock: any;
  let sourceFileMock: any;
  let writer: IndexWriter;
  const outputDir = '/out';

  beforeEach(() => {
    // 2. Setup Mocks
    sourceFileMock = {
      addExportDeclaration: vi.fn(),
      formatText: vi.fn(),
    };
    projectMock = {
      createSourceFile: vi.fn().mockReturnValue(sourceFileMock),
    };

    // Default behavior for TypeHelper
    vi.mocked(TypeHelper.getFileName).mockImplementation((name) => name.toLowerCase());

    writer = new IndexWriter(projectMock, outputDir);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should generate all three index files', async () => {
    const ir: IrDefinition = { models: [], services: [] };
    await writer.write(ir);

    // Should create dto/index.ts, services/index.ts, and root index.ts
    expect(projectMock.createSourceFile).toHaveBeenCalledTimes(3);
    expect(projectMock.createSourceFile).toHaveBeenCalledWith(
      `${outputDir}/dto/index.ts`,
      expect.any(String),
      { overwrite: true },
    );
    expect(projectMock.createSourceFile).toHaveBeenCalledWith(
      `${outputDir}/services/index.ts`,
      expect.any(String),
      { overwrite: true },
    );
    expect(projectMock.createSourceFile).toHaveBeenCalledWith(
      `${outputDir}/index.ts`,
      expect.any(String),
      { overwrite: true },
    );
  });

  describe('writeDtoIndex', () => {
    it('should export all models correctly', async () => {
      const ir: IrDefinition = {
        models: [
          { name: 'UserDto', fileName: 'user-dto', isEnum: false } as any,
          { name: 'StatusEnum', fileName: 'status-enum', isEnum: true } as any,
        ],
        services: [],
      };

      await writer.write(ir);

      // Verify exports
      expect(sourceFileMock.addExportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: './user-dto.dto',
      });
      expect(sourceFileMock.addExportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: './status-enum.enum',
      });
    });
  });

  describe('writeServiceIndex', () => {
    it('should export all services using TypeHelper for filenames', async () => {
      vi.mocked(TypeHelper.getFileName).mockReturnValue('user-service');

      const ir: IrDefinition = {
        models: [],
        services: [{ name: 'UserService' } as any],
      };

      await writer.write(ir);

      expect(TypeHelper.getFileName).toHaveBeenCalledWith('UserService');
      expect(sourceFileMock.addExportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: './user-service.service',
      });
    });
  });

  describe('writeMainIndex', () => {
    it('should export dto and services directories', async () => {
      const ir: IrDefinition = { models: [], services: [] };

      await writer.write(ir);

      // We need to check the call that happens on the MAIN index file.
      // Since createSourceFile reuses the same mock object, we check all calls.
      expect(sourceFileMock.addExportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: './dto',
      });
      expect(sourceFileMock.addExportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: './services',
      });
    });
  });
});
