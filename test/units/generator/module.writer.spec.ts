import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { ModuleWriter } from '../../../src/core/generator/writers/module.writer';
import { IrDefinition } from '../../../src/core/ir/interfaces';

describe('ModuleWriter', () => {
  const outputDir = '/tmp/test-module-writer';

  it('should generate all required files', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir, 'Api', 'Test Spec', '1.0.0');
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    const sourceFiles = project.getSourceFiles();
    const filePaths = sourceFiles.map((f) => f.getFilePath());

    expect(filePaths).toContain(`${outputDir}/api.types.ts`);
    expect(filePaths).toContain(`${outputDir}/api.configuration.ts`);
    expect(filePaths).toContain(`${outputDir}/api.utils.ts`);
    expect(filePaths).toContain(`${outputDir}/api.module.ts`);
  });

  it('should generate ApiModule class with @Module decorator', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir);
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    const moduleFile = project.getSourceFile(`${outputDir}/api.module.ts`);
    expect(moduleFile).toBeDefined();

    const moduleClass = moduleFile?.getClass('ApiModule');
    expect(moduleClass).toBeDefined();
    expect(moduleClass?.getDecorator('Module')).toBeDefined();
  });

  it('should generate forRoot static method', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir);
    const ir: IrDefinition = {
      models: [],
      services: [{ name: 'UserService', operations: new Map() }],
    };

    await writer.write(ir);

    const moduleFile = project.getSourceFile(`${outputDir}/api.module.ts`);
    const moduleClass = moduleFile?.getClass('ApiModule');
    const forRootMethod = moduleClass?.getMethod('forRoot');

    expect(forRootMethod).toBeDefined();
    expect(forRootMethod?.isStatic()).toBe(true);
    expect(forRootMethod?.getReturnType().getText()).toContain('DynamicModule');

    const methodText = forRootMethod?.getBodyText();
    expect(methodText).toContain('providers');
    expect(methodText).toContain('ApiConfiguration');
    expect(methodText).toContain('UserService');
    expect(methodText).toContain('HttpModule.register');
  });

  it('should generate forRootAsync static method', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir);
    const ir: IrDefinition = {
      models: [],
      services: [{ name: 'AuthService', operations: new Map() }],
    };

    await writer.write(ir);

    const moduleFile = project.getSourceFile(`${outputDir}/api.module.ts`);
    const moduleClass = moduleFile?.getClass('ApiModule');
    const forRootAsyncMethod = moduleClass?.getMethod('forRootAsync');

    expect(forRootAsyncMethod).toBeDefined();
    expect(forRootAsyncMethod?.isStatic()).toBe(true);
    expect(forRootAsyncMethod?.getReturnType().getText()).toContain('DynamicModule');

    const methodText = forRootAsyncMethod?.getBodyText();
    expect(methodText).toContain('createAsyncProviders');
    expect(methodText).toContain('HttpModule.registerAsync');
    expect(methodText).toContain('AuthService');
  });

  it('should generate createAsyncProviders helper function', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir);
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    const moduleFile = project.getSourceFile(`${outputDir}/api.module.ts`);
    const createAsyncProvidersFunc = moduleFile?.getFunction('createAsyncProviders');

    expect(createAsyncProvidersFunc).toBeDefined();
    expect(createAsyncProvidersFunc?.isExported()).toBe(false);

    const funcText = createAsyncProvidersFunc?.getBodyText();
    expect(funcText).toContain('options.useFactory');
    expect(funcText).toContain('options.useExisting');
    expect(funcText).toContain('options.useClass');
    expect(funcText).toContain('API_CONFIG');
  });

  it('should generate api.types.ts with required interfaces', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir);
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    const typesFile = project.getSourceFile(`${outputDir}/api.types.ts`);
    expect(typesFile).toBeDefined();

    expect(typesFile?.getInterface('ApiModuleConfig')).toBeDefined();
    expect(typesFile?.getInterface('ApiModuleConfigFactory')).toBeDefined();
    expect(typesFile?.getInterface('ApiModuleAsyncConfig')).toBeDefined();
    expect(typesFile?.getTypeAlias('ApiHeaders')).toBeDefined();
    expect(typesFile?.getVariableDeclaration('API_CONFIG')).toBeDefined();
  });

  it('should generate api.configuration.ts with ApiConfiguration service', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir);
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    const configFile = project.getSourceFile(`${outputDir}/api.configuration.ts`);
    expect(configFile).toBeDefined();

    const apiConfigClass = configFile?.getClass('ApiConfiguration');
    expect(apiConfigClass).toBeDefined();
    expect(apiConfigClass?.getDecorator('Injectable')).toBeDefined();
    expect(apiConfigClass?.getConstructors()).toHaveLength(1);
    expect(apiConfigClass?.getGetAccessor('baseUrl')).toBeDefined();
    expect(apiConfigClass?.getGetAccessor('headers')).toBeDefined();
  });

  it('should generate api.utils.ts with toFormData function', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir);
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    const utilsFile = project.getSourceFile(`${outputDir}/api.utils.ts`);
    expect(utilsFile).toBeDefined();

    const funcText = utilsFile?.getFullText();
    expect(funcText).toContain('toFormData');
    expect(funcText).toContain('FormData');
    expect(funcText).toContain('form-data');
    expect(funcText).toContain('Readable');
    expect(funcText).toContain('Buffer.isBuffer');
  });

  it('should use custom module name', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir, 'CustomSdk');
    const ir: IrDefinition = { models: [], services: [] };

    await writer.write(ir);

    const moduleFile = project.getSourceFile(`${outputDir}/api.module.ts`);
    const moduleClass = moduleFile?.getClass('CustomSdkModule');
    expect(moduleClass).toBeDefined();
  });

  it('should import and register all services', async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const writer = new ModuleWriter(project, outputDir);
    const ir: IrDefinition = {
      models: [],
      services: [
        { name: 'UserService', operations: new Map() },
        { name: 'AuthService', operations: new Map() },
        { name: 'ProductService', operations: new Map() },
      ],
    };

    await writer.write(ir);

    const moduleFile = project.getSourceFile(`${outputDir}/api.module.ts`);
    const imports = moduleFile?.getImportDeclarations();
    const serviceImports = imports?.filter((imp) =>
      imp.getModuleSpecifierValue().includes('./services/'),
    );
    expect(serviceImports).toHaveLength(3);

    const forRootMethod = moduleFile?.getClass('ApiModule')?.getMethod('forRoot');
    const methodText = forRootMethod?.getBodyText();
    expect(methodText).toContain('UserService');
    expect(methodText).toContain('AuthService');
    expect(methodText).toContain('ProductService');
  });
});
