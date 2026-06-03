import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { ImportBuilder } from '../../../src/core/generator/writers/core/import-builder';

describe('ImportBuilder', () => {
  let importBuilder: ImportBuilder;
  let printer: AstPrinter;

  beforeEach(() => {
    importBuilder = new ImportBuilder();
    printer = new AstPrinter();
  });

  describe('createNamedImport', () => {
    it('should generate a single named import', async () => {
      const node = importBuilder.createNamedImport('./user.dto', ['UserDto']);
      const result = await printer.print([node]);

      expect(result.generatedCode).toBe("import { UserDto } from './user.dto';\n");
    });

    it('should generate multiple named imports', async () => {
      const node = importBuilder.createNamedImport('class-validator', [
        'IsString',
        'IsOptional',
        'MinLength',
      ]);
      const result = await printer.print([node]);

      expect(result.generatedCode).toBe(
        "import { IsString, IsOptional, MinLength } from 'class-validator';\n",
      );
    });

    it('should throw an error if the names array is empty', () => {
      expect(() => {
        importBuilder.createNamedImport('class-validator', []);
      }).toThrowError(
        "Cannot create an import declaration for module 'class-validator' without named imports.",
      );
    });
  });
});
