import { beforeEach, describe, expect, it } from 'vitest';

import { ApiConfigurationWriter } from '../../../src/core/generator/writers/api-configuration.writer';
import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { DecoratorBuilder } from '../../../src/core/generator/writers/core/decorator-builder';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../../src/core/generator/writers/core/import-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';

describe('ApiConfigurationWriter', () => {
  let writer: ApiConfigurationWriter;

  beforeEach(() => {
    const printer = new AstPrinter();
    const headerGenerator = new HeaderGenerator();
    const importBuilder = new ImportBuilder();
    const typeBuilder = new TypeBuilder();
    const decoratorBuilder = new DecoratorBuilder();

    writer = new ApiConfigurationWriter(
      printer,
      headerGenerator,
      importBuilder,
      typeBuilder,
      decoratorBuilder,
    );
  });

  it('should generate the complete api.configuration.ts file', async () => {
    const result = await writer.write('1.0.0', 'OpenAPI TEST', '3.1.0');

    expect(result.filename).toBe('api.configuration.ts');

    const generatedCode = result.generatedCode;

    expect(generatedCode).toContain('generated with nog-cli v1.0.0');
    expect(generatedCode).toContain("import { Injectable, Inject } from '@nestjs/common';");
    expect(generatedCode).toContain("import { AxiosRequestConfig } from 'axios';");
    expect(generatedCode).toContain(
      "import { API_CONFIG, ApiModuleConfig, ApiHeaders } from './api.types';",
    );

    expect(generatedCode).toContain('@Injectable()');
    expect(generatedCode).toContain('export class ApiConfiguration {');
    expect(generatedCode).toMatch(
      /constructor(\s*)?\((\s*)?@Inject\(API_CONFIG\)(\s*)?readonly config\?: ApiModuleConfig,?(\s*)\)(\s*){/gm,
    );
    expect(generatedCode).toContain('this.config = config ?? {};');
    expect(generatedCode).toContain('get baseUrl(): string {');
    expect(generatedCode).toContain("return this.config?.baseUrl ?? '';");
    expect(generatedCode).toContain('get headers(): ApiHeaders {');
    expect(generatedCode).toContain('return this.config?.headers ?? {};');
    expect(generatedCode).toContain('get httpOptions(): AxiosRequestConfig {');
    expect(generatedCode).toContain('return this.config?.httpOptions ?? {};');
  });
});
