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
    const mockServices = [
      { name: 'UsersService', fileName: 'users.service' },
      { name: 'PostsService', fileName: 'posts.service' },
    ] as IrService[];

    const result = await writer.write(mockServices, 'MyApi', '1.0.0', 'OpenAPI TEST', '3.1.0');

    expect(result.filename).toBe('api.module.ts');

    const output = result.generatedCode;

    // Base imports — Provider and Type come from @nestjs/common because the
    // inline createAsyncProviders helper references them.
    expect(output).toMatch(
      /import\s*\{[\s\S]*?Module[\s\S]*?DynamicModule[\s\S]*?Provider[\s\S]*?Type[\s\S]*?\}\s*from\s*['"]@nestjs\/common['"]/,
    );
    expect(output).toContain("import { HttpModule } from '@nestjs/axios';");
    expect(output).toContain("import { ApiConfiguration } from './api.configuration';");
    expect(output).toContain("import { RequestBuilder } from './request-builder.service';");
    expect(output).toMatch(
      /import\s*\{[\s\S]*?API_CONFIG[\s\S]*?ApiModuleAsyncConfig[\s\S]*?ApiModuleConfig[\s\S]*?ApiModuleConfigFactory[\s\S]*?\}\s*from\s*['"]\.\/api\.types['"]/,
    );

    expect(output).toContain("import { UsersService } from './services/users.service';");
    expect(output).toContain("import { PostsService } from './services/posts.service';");

    // Class declaration
    expect(output).toContain('@Module({})');
    expect(output).toContain('export class MyApiModule {');

    // forRoot — providers declared inline on the module, HttpModule.register reads config inline.
    expect(output).toContain('static forRoot(config: ApiModuleConfig = {}): DynamicModule {');
    expect(output).toContain('HttpModule.register({');
    expect(output).toContain('paramsSerializer: { indexes: null }');
    expect(output).toMatch(/\.\.\.config\.httpOptions/);
    expect(output).toMatch(
      /providers:\s*\[\s*ApiConfiguration,\s*RequestBuilder,\s*\{[\s\S]*?provide:\s*API_CONFIG[\s\S]*?useValue:\s*config[\s\S]*?\},\s*PostsService,\s*UsersService,?\s*\]/,
    );
    expect(output).toMatch(
      /exports:\s*\[\s*API_CONFIG,\s*ApiConfiguration,\s*RequestBuilder,\s*HttpModule,\s*PostsService,\s*UsersService,?\s*\]/,
    );

    // forRootAsync — declares asyncProviders + imports as locals, then reuses
    // asyncProviders by reference both in the module's providers and in
    // HttpModule.registerAsync({ extraProviders }). Same reference is what keeps
    // the consumer useFactory firing exactly once per registration on NestJS v11.
    expect(output).toMatch(
      /static forRootAsync\(\s*options: ApiModuleAsyncConfig,?\s*\): DynamicModule \{/,
    );
    expect(output).toMatch(/const asyncProviders\s*=\s*createAsyncProviders\(options\);/);
    expect(output).toMatch(/const imports\s*=\s*options\.imports\s*\?\?\s*\[\s*\];/);

    expect(output).toContain('HttpModule.registerAsync({');
    expect(output).toMatch(/imports,/);
    expect(output).toMatch(/inject:\s*\[API_CONFIG\]/);
    expect(output).toMatch(/extraProviders:\s*asyncProviders/);
    expect(output).toContain('useFactory: async (config: ApiModuleConfig) =>');

    // Async providers list — config providers spread inline, then services.
    expect(output).toMatch(
      /providers:\s*\[\s*ApiConfiguration,\s*RequestBuilder,\s*\.\.\.asyncProviders,\s*PostsService,\s*UsersService,?\s*\]/,
    );

    // Helper function declaration shipped in the same file.
    expect(output).toMatch(
      /function createAsyncProviders\(options: ApiModuleAsyncConfig\): Provider\[\]/,
    );
    // It branches on useFactory / useExisting / useClass and forwards extraProviders.
    expect(output).toMatch(/if \(options\.useFactory\)/);
    expect(output).toMatch(/if \(options\.useExisting\)/);
    expect(output).toMatch(/if \(options\.useClass\)/);
  });
});
