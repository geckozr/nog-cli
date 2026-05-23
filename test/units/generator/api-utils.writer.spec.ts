import { beforeEach, describe, expect, it } from 'vitest';

import { ApiUtilsWriter } from '../../../src/core/generator/writers/api-utils.writer';
import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../../src/core/generator/writers/core/import-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';

describe('ApiUtilsWriter', () => {
  let writer: ApiUtilsWriter;

  beforeEach(() => {
    const printer = new AstPrinter();
    const headerGenerator = new HeaderGenerator();
    const importBuilder = new ImportBuilder();
    const typeBuilder = new TypeBuilder();

    writer = new ApiUtilsWriter(printer, headerGenerator, importBuilder, typeBuilder);
  });

  it('should generate the api.utils.ts file with toFormData function', async () => {
    const result = await writer.write('1.0.0', 'OpenAPI TEST', '3.1.0');

    expect(result.filename).toBe('api.utils.ts');

    const output = result.generatedCode;

    // Imports
    expect(output).toContain("import * as FormData from 'form-data';");
    expect(output).toContain("import { Readable } from 'stream';");

    // Function signature
    expect(output).toContain('export function toFormData(obj: Record<string, any>): FormData {');

    // Core logic validation (Checking key parts of the if-else chain generated via pure AST)
    expect(output).toContain('const formData = new FormData();');
    expect(output).toContain('for (const [key, value] of Object.entries(obj)) {');

    // 1. Undefined / Null
    expect(output).toContain('if (value === undefined || value === null) {');
    expect(output).toContain('continue;');

    // 2. Buffer
    expect(output).toContain('if (Buffer.isBuffer(value)) {');
    expect(output).toContain('formData.append(key, value, key);');

    // 3. Readable
    expect(output).toContain('else if (value instanceof Readable) {');

    // 4. Object with Buffer
    expect(output).toMatch(
      /else\s+if\s*\(\s*typeof value === ['"]object['"]\s*&&\s*value\.buffer\s*&&\s*Buffer\.isBuffer\(value\.buffer\)\s*\)/,
    );
    expect(output).toContain('const options: any = { filename: value.filename || key };');

    // 5. Array
    expect(output).toContain('else if (Array.isArray(value)) {');
    expect(output).toContain('for (const item of value) {');

    // 6. JSON Object
    expect(output).toMatch(/else\s+if\s*\(\s*typeof value === ['"]object['"]\s*\)/);
    expect(output).toContain('formData.append(key, JSON.stringify(value));');

    // 7. Primitive
    expect(output).toContain('formData.append(key, String(value));');

    expect(output).toContain('return formData;');
  });
});
