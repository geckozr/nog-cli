import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';

describe('HeaderGenerator', () => {
  let printer: AstPrinter;
  let headerGenerator: HeaderGenerator;

  beforeEach(() => {
    printer = new AstPrinter();
    headerGenerator = new HeaderGenerator();
  });

  describe('addHeader', () => {
    it('should create the generated comments for all the nog-cli files', async () => {
      const nodes: ts.Node[] = [
        ts.factory.createVariableStatement(
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
        ),
      ];

      const cliVersion = '0.10.6';
      const specTitle = 'Address Autocomplete API';
      const specVersion = '1.0.0';

      const updatedNodes = headerGenerator.addHeader(nodes, cliVersion, specTitle, specVersion);

      // Verify that the header comment was added to the first node
      const output = await printer.print(updatedNodes);
      const printedCode = output.generatedCode;
      expect(printedCode).toContain('/* tslint:disable */');
      expect(printedCode).toContain('/* eslint-disable */');
      expect(printedCode).toContain(
        `// generated with nog-cli v${cliVersion} - spec: ${specTitle} v${specVersion}`,
      );
    });
  });

  it('should return the original nodes if the array is empty', () => {
    const emptyNodes: ts.Node[] = [];
    const result = headerGenerator.addHeader(emptyNodes, '0.10.6', 'Test API', '1.0.0');
    expect(result).toEqual(emptyNodes);
  });
});
