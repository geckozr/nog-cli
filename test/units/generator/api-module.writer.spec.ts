import { beforeEach, describe, expect, it } from 'vitest';

import { ApiModuleWriter } from '../../../src/core/generator/writers/api-module.writer';
import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { DecoratorBuilder } from '../../../src/core/generator/writers/core/decorator-builder';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../../src/core/generator/writers/core/import-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';
import { IrService } from '../../../src/core/ir';

describe('ApiModuleWriter', () => {
  let writer: ApiModuleWriter;

  beforeEach(() => {
    const printer = new AstPrinter();
    const headerGenerator = new HeaderGenerator();
    const importBuilder = new ImportBuilder();
    const typeBuilder = new TypeBuilder();
    const decoratorBuilder = new DecoratorBuilder();

    writer = new ApiModuleWriter(
      printer,
      headerGenerator,
      importBuilder,
      typeBuilder,
      decoratorBuilder,
    );
  });

  it('should generate the complete api.module.ts file', async () => {
    const mockServices = [{ name: 'UsersService' }, { name: 'PostsService' }] as IrService[];

    const result = await writer.write(mockServices, 'MyApi', '1.0.0', 'OpenAPI TEST', '3.1.0');

    expect(result.filename).toBe('api.module.ts');

    const output = result.generatedCode;

    // Base imports
    expect(output).toContain(
      "import { Module, DynamicModule, Provider, Type } from '@nestjs/common';",
    );
    expect(output).toContain("import { HttpModule } from '@nestjs/axios';");
    expect(output).toContain("import { ApiConfiguration } from './api.configuration';");
    // api.types import is emitted as multi-line by the printer
    expect(output).toMatch(
      /import\s*\{[\s\S]*?API_CONFIG[\s\S]*?ApiModuleAsyncConfig[\s\S]*?ApiModuleConfig[\s\S]*?ApiModuleConfigFactory[\s\S]*?\}\s*from\s*['"]\.\/api\.types['"]/,
    );

    // Dynamic service imports — file names are kebab-cased from the service class name
    expect(output).toContain("import { UsersService } from './services/users-service.service';");
    expect(output).toContain("import { PostsService } from './services/posts-service.service';");

    // Class declaration
    expect(output).toContain('@Module({})');
    expect(output).toContain('export class MyApiModule {');

    // forRoot
    expect(output).toContain('static forRoot(config: ApiModuleConfig = {}): DynamicModule {');
    // Provider array is emitted multi-line; verify the key entries individually
    expect(output).toContain('const providers: Provider[]');
    expect(output).toContain('provide: API_CONFIG,');
    expect(output).toContain('useValue: config ?? {}');
    expect(output).toContain('HttpModule.register({');
    expect(output).toContain('exports: [ApiConfiguration, PostsService, UsersService]');

    // forRootAsync
    expect(output).toContain('static forRootAsync(options: ApiModuleAsyncConfig): DynamicModule {');
    expect(output).toContain('const asyncProviders = createAsyncProviders(options);');
    expect(output).toContain('HttpModule.registerAsync({');
    expect(output).toContain('exports: [ApiConfiguration, PostsService, UsersService]');

    // createAsyncProviders helper
    expect(output).toContain(
      'function createAsyncProviders(options: ApiModuleAsyncConfig): Provider[] {',
    );
    expect(output).toContain('if (options.useFactory) {');
    expect(output).toContain(
      'const inject: (Type<ApiModuleConfigFactory> | string | symbol)[] = [];',
    );
    // Inline if — no block braces
    expect(output).toContain('if (options.useExisting)');
    expect(output).toContain('const asyncProvider: Provider = {');
    // providers array is emitted multi-line; verify the key entries individually
    expect(output).toContain('asyncProvider,');
    expect(output).toContain('...(options.extraProviders ?? [])');
    expect(output).toContain('return providers;');
  });
});
