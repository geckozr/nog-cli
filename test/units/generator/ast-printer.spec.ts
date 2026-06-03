import * as prettier from 'prettier';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { Logger } from '../../../src/utils/logger';

vi.mock('prettier', async (importOriginal) => {
  const actual = await importOriginal<typeof prettier>();
  return {
    ...actual,
    format: vi.fn().mockImplementation(actual.format),
  };
});

describe('AstPrinter', () => {
  let printer: AstPrinter;

  beforeEach(() => {
    printer = new AstPrinter();
  });

  describe('print', () => {
    it('should create a simple node using the printer', async () => {
      const simpleNode = ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [
            ts.factory.createVariableDeclaration(
              'x',
              undefined,
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
              ts.factory.createNumericLiteral(42),
            ),
          ],
          ts.NodeFlags.Const,
        ),
      );

      const file = await printer.print([simpleNode]);

      expect(file.generatedCode).toBe('const x: number = 42;\n');
    });

    it('should format code using Prettier with configured options (e.g., singleQuote)', async () => {
      const node = ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [
            ts.factory.createVariableDeclaration(
              'msg',
              undefined,
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              ts.factory.createStringLiteral('hello world'),
            ),
          ],
          ts.NodeFlags.Const,
        ),
      );

      const file = await printer.print([node], 'format.ts');

      expect(file.generatedCode).toContain("'hello world'");
      expect(file.generatedCode).not.toContain('"hello world"');
    });
  });

  it('should return unformatted code and log error if Prettier fails', async () => {
    const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

    const formatMock = vi.mocked(prettier.format);
    formatMock.mockRejectedValueOnce(new Error('Simulated Prettier crash'));

    const simpleNode = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'z',
            undefined,
            ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
            ts.factory.createNumericLiteral(99),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const file = await printer.print([simpleNode], 'fallback.ts');

    expect(file.filename).toBe('fallback.ts');
    // ts.Printer output (raw, without Prettier) is `const z: number = 99;\n`.
    expect(file.generatedCode).toBe('const z: number = 99;\n');
    expect(loggerErrorSpy).toHaveBeenCalledWith('Prettier formatting failed:', expect.any(Error));

    loggerErrorSpy.mockRestore();
  });
});
