import * as prettier from 'prettier';
import ts from 'typescript';

import { Logger } from '../../../../utils/logger';

export interface IAstPrintedFile {
  filename: string;
  generatedCode: string;
}

export class AstPrinter {
  private readonly printer: ts.Printer;

  constructor() {
    this.printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    });
  }

  /**
   * Converts an array of TypeScript AST nodes into a formatted string.
   * @param nodes The AST nodes to print.
   * @param filename A virtual filename used by the TypeScript compiler for context.
   * @returns The generated TypeScript source code.
   */
  public async print(nodes: ts.Node[], filename: string = 'virtual.ts'): Promise<IAstPrintedFile> {
    const sourceFile = ts.createSourceFile(
      filename,
      '',
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    const nodeArray = ts.factory.createNodeArray(nodes);
    const rawCode = this.printer.printList(ts.ListFormat.MultiLine, nodeArray, sourceFile);

    // Prettify the generated code for better readability
    try {
      const formattedCode = await prettier.format(rawCode, {
        parser: 'typescript',
        singleQuote: true,
      });

      return {
        filename,
        generatedCode: formattedCode,
      };
    } catch (error) {
      Logger.error('Prettier formatting failed:', error);
      return {
        filename,
        generatedCode: rawCode, // Return unformatted code if Prettier fails
      };
    }
  }
}
