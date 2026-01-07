import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TypeHelper } from '../../../src/core/generator/helpers/type.helper';
import { ModuleWriter } from '../../../src/core/generator/writers/module.writer';
import { IrDefinition } from '../../../src/core/ir/interfaces';

// Mock helpers
vi.mock('../../../src/core/generator/helpers/file-header.helper', () => ({
  FileHeaderHelper: {
    getHeader: () => '// Header',
    addHeader: vi.fn(),
  },
}));

// Mock TypeHelper factory
vi.mock('../../../src/core/generator/helpers/type.helper', () => ({
  TypeHelper: {
    getFileName: vi.fn(),
  },
}));

describe('ModuleWriter', () => {
  let projectMock: any;
  let sourceFileMock: any;
  let classMock: any;
  const outputDir = '/out';

  beforeEach(() => {
    classMock = {
      addDecorator: vi.fn(),
    };
    sourceFileMock = {
      addImportDeclaration: vi.fn(),
      addClass: vi.fn().mockReturnValue(classMock),
      formatText: vi.fn(),
    };
    projectMock = {
      createSourceFile: vi.fn().mockReturnValue(sourceFileMock),
    };

    vi.clearAllMocks();

    // Default mock behavior
    vi.mocked(TypeHelper.getFileName).mockImplementation((name) => name.toLowerCase());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should generate the module file with correct name', async () => {
    const writer = new ModuleWriter(projectMock, outputDir, 'MySdkModule');
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    expect(projectMock.createSourceFile).toHaveBeenCalledWith(
      `${outputDir}/my-sdk-module.module.ts`,
      '',
      { overwrite: true },
    );
  });

  it('should import standard NestJS modules', async () => {
    const writer = new ModuleWriter(projectMock, outputDir);
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    expect(sourceFileMock.addImportDeclaration).toHaveBeenCalledWith({
      moduleSpecifier: '@nestjs/common',
      namedImports: ['Module'],
    });
    expect(sourceFileMock.addImportDeclaration).toHaveBeenCalledWith({
      moduleSpecifier: '@nestjs/axios',
      namedImports: ['HttpModule'],
    });
  });

  it('should import and register services', async () => {
    const writer = new ModuleWriter(projectMock, outputDir);
    const ir: IrDefinition = {
      models: [],
      services: [
        { name: 'UserService', operations: new Map() },
        { name: 'AuthService', operations: new Map() },
      ],
    };

    vi.mocked(TypeHelper.getFileName)
      .mockReturnValueOnce('user-service')
      .mockReturnValueOnce('auth-service');

    await writer.write(ir);

    // Verify Imports
    expect(sourceFileMock.addImportDeclaration).toHaveBeenCalledWith({
      moduleSpecifier: './services/user-service.service',
      namedImports: ['UserService'],
    });
    expect(sourceFileMock.addImportDeclaration).toHaveBeenCalledWith({
      moduleSpecifier: './services/auth-service.service',
      namedImports: ['AuthService'],
    });

    // Verify Module Class Definition
    expect(sourceFileMock.addClass).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ApiModule', // Default name (Api + Module suffix)
        isExported: true,
        decorators: expect.arrayContaining([expect.objectContaining({ name: 'Module' })]),
      }),
    );
  });

  it('should generate correct module metadata strings (imports, providers, exports)', async () => {
    const writer = new ModuleWriter(projectMock, outputDir);
    const ir: IrDefinition = {
      models: [],
      services: [
        { name: 'UserService', operations: new Map() },
        { name: 'AuthService', operations: new Map() },
      ],
    };

    await writer.write(ir);

    const addClassCall = sourceFileMock.addClass.mock.calls[0][0];
    const moduleDecorator = addClassCall.decorators.find((d: any) => d.name === 'Module');

    const writerCallback = moduleDecorator.arguments[0];

    const writerMock = {
      write: vi.fn(),
      writeLine: vi.fn(),
      newLine: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };

    writerCallback(writerMock);

    expect(writerMock.write).toHaveBeenCalledWith('imports: [HttpModule],');
    expect(writerMock.write).toHaveBeenCalledWith('providers: [UserService, AuthService],');
    expect(writerMock.write).toHaveBeenCalledWith('exports: [UserService, AuthService],');
  });

  it('should render module metadata callback output', async () => {
    const writer = new ModuleWriter(projectMock, outputDir);
    const ir: IrDefinition = {
      models: [],
      services: [{ name: 'SoloService', operations: new Map() }],
    };

    await writer.write(ir);

    const addClassCall = sourceFileMock.addClass.mock.calls[0][0];
    const moduleDecorator = addClassCall.decorators.find((d: any) => d.name === 'Module');
    const writerCallback = moduleDecorator.arguments[0];

    const chunks: string[] = [];
    const writerMock = {
      write: (text: string) => {
        chunks.push(text);
        return writerMock;
      },
      writeLine: (text: string) => {
        chunks.push(`${text}\n`);
        return writerMock;
      },
      newLine: () => {
        chunks.push('\n');
        return writerMock;
      },
      indent: (cb: () => void) => cb(),
    };

    writerCallback(writerMock);

    const rendered = chunks.join('');
    expect(rendered).toContain('{');
    expect(rendered).toContain('imports: [HttpModule],');
    expect(rendered).toContain('providers: [SoloService],');
    expect(rendered).toContain('exports: [SoloService],');
    expect(rendered.trim().endsWith('}')).toBe(true);
  });
});
