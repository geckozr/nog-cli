import ts from 'typescript';

import { AstPrinter, IAstPrintedFile } from './core/ast-printer';
import { HeaderGenerator } from './core/header-generator';

export class IndexWriter {
  constructor(
    private readonly printer: AstPrinter,
    private readonly headerGenerator: HeaderGenerator,
  ) {}

  /**
   * Generates a barrel index file exporting all provided modules.
   * @param fileNames The list of filenames (without extension) to export.
   * @param cliVersion The CLI version for the header.
   * @param specVersion The OpenAPI spec version for the header.
   * @returns The generated source code for the index file.
   */
  public async generate(
    fileNames: string[],
    cliVersion: string,
    specTitle: string,
    specVersion: string,
  ): Promise<IAstPrintedFile> {
    const exportNodes = fileNames.map((fileName) => {
      return ts.factory.createExportDeclaration(
        undefined,
        false,
        undefined,
        ts.factory.createStringLiteral(`./${fileName}`),
        undefined,
      );
    });

    const nodesWithHeader = this.headerGenerator.addHeader(
      exportNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    return this.printer.print(nodesWithHeader, 'index.ts');
  }
}
