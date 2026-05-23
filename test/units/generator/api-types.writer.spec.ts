import { beforeEach, describe, expect, it } from 'vitest';

import { ApiTypesWriter } from '../../../src/core/generator/writers/api-types.writer';
import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { DeclarationBuilder } from '../../../src/core/generator/writers/core/declaration-builder';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../../src/core/generator/writers/core/import-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';

describe('ApiTypesWriter', () => {
  let writer: ApiTypesWriter;

  beforeEach(() => {
    const printer = new AstPrinter();
    const headerGenerator = new HeaderGenerator();
    const importBuilder = new ImportBuilder();
    const typeBuilder = new TypeBuilder();
    const declarationBuilder = new DeclarationBuilder();

    writer = new ApiTypesWriter(
      printer,
      headerGenerator,
      importBuilder,
      typeBuilder,
      declarationBuilder,
    );
  });

  it('should generate the complete api.types.ts file', async () => {
    const result = await writer.write('1.0.0', 'OpenAPI TEST', '3.1.0');

    expect(result.filename).toBe('api.types.ts');

    const generatedCode = result.generatedCode;

    expect(generatedCode).toContain('generated with nog-cli v1.0.0');
    expect(generatedCode).toContain(
      "import { ModuleMetadata, Provider, Type } from '@nestjs/common';",
    );
    expect(generatedCode).toContain("import { AxiosRequestConfig } from 'axios';");

    expect(generatedCode).toContain('export type ApiHeaders = Record<string, string>;');

    expect(generatedCode).toContain('export interface ApiModuleConfig {');
    expect(generatedCode).toContain('baseUrl?: string;');
    expect(generatedCode).toContain('headers?: ApiHeaders;');
    expect(generatedCode).toContain('httpOptions?: AxiosRequestConfig;');

    expect(generatedCode).toContain('export interface ApiModuleConfigFactory {');
    expect(generatedCode).toContain(
      'createApiModuleConfig(): Promise<ApiModuleConfig> | ApiModuleConfig;',
    );

    expect(generatedCode).toContain(
      "export interface ApiModuleAsyncConfig extends Pick<ModuleMetadata, 'imports'>",
    );
    expect(generatedCode).toContain('useExisting?: Type<ApiModuleConfigFactory>;');
    expect(generatedCode).toContain('useClass?: Type<ApiModuleConfigFactory>;');
    expect(generatedCode).toMatch(
      /useFactory\?:\s*\(\s*\.\.\.args:\s*unknown\[\]\s*\)\s*=>\s*Promise<ApiModuleConfig>\s*\|\s*ApiModuleConfig;/,
    );
    expect(generatedCode).toContain('inject?: Array<string | symbol | Type<unknown>>;');
    expect(generatedCode).toContain('extraProviders?: Provider[];');

    expect(generatedCode).toContain("export const API_CONFIG = Symbol('API_CONFIG');");
  });
});
