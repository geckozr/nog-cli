import ts from 'typescript';

import { AstPrinter, IAstPrintedFile } from './core/ast-printer';
import { HeaderGenerator } from './core/header-generator';
import { ImportBuilder } from './core/import-builder';
import { TypeBuilder } from './core/type-builder';

export class ApiUtilsWriter {
  constructor(
    private readonly printer: AstPrinter,
    private readonly headerGenerator: HeaderGenerator,
    private readonly importBuilder: ImportBuilder,
    private readonly typeBuilder: TypeBuilder,
  ) {}

  /**
   * Generates the `api.utils.ts` file containing the `toFormData` utility function.
   *
   * @param cliVersion - Version of the CLI tool, written into the file header.
   * @param specTitle - Title of the OpenAPI specification, written into the file header.
   * @param specVersion - Version of the OpenAPI specification, written into the file header.
   * @returns File name and rendered TypeScript source content.
   */
  public async write(
    cliVersion: string,
    specTitle: string,
    specVersion: string,
  ): Promise<IAstPrintedFile> {
    const importNodes: ts.ImportDeclaration[] = [];

    importNodes.push(
      ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamespaceImport(ts.factory.createIdentifier('FormData')),
        ),
        ts.factory.createStringLiteral('form-data'),
      ),
    );

    importNodes.push(this.importBuilder.createNamedImport('stream', ['Readable']));

    const functionNode = this.buildToFormDataFunction();

    // JSDoc is attached via synthetic leading comment because the ts.factory API does not
    // expose a first-class JSDoc builder for standalone function declarations.
    const jsDocText = [
      '*',
      ' * Converts an object to FormData for multipart/form-data requests.',
      ' * Handles Buffer, Readable streams, and nested objects.',
      ' *',
      ' * For file uploads, you can pass:',
      ' * - A Buffer directly: { image: buffer } (filename = field name)',
      " * - A ReadStream: { image: fs.createReadStream('file.jpg') } (auto-detects filename and Content-Type)",
      " * - An object with metadata: { image: { buffer: Buffer, filename: 'file.jpg', contentType?: 'image/jpeg' } }",
      ' *',
      ' * @param obj - Object to convert to FormData',
      ' * @returns FormData instance',
      ' ',
    ].join('\n');
    ts.addSyntheticLeadingComment(
      functionNode,
      ts.SyntaxKind.MultiLineCommentTrivia,
      jsDocText,
      true,
    );

    const fileNodes = [...importNodes, functionNode];
    const nodesWithHeader = this.headerGenerator.addHeader(
      fileNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    return this.printer.print(nodesWithHeader, 'api.utils.ts');
  }

  private buildToFormDataFunction(): ts.FunctionDeclaration {
    const formDataDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'formData',
            undefined,
            undefined,
            ts.factory.createNewExpression(ts.factory.createIdentifier('FormData'), undefined, []),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const loopBody = this.buildLoopBody();

    const forOfStatement = ts.factory.createForOfStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createArrayBindingPattern([
              ts.factory.createBindingElement(undefined, undefined, 'key'),
              ts.factory.createBindingElement(undefined, undefined, 'value'),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Object'), 'entries'),
        undefined,
        [ts.factory.createIdentifier('obj')],
      ),
      loopBody,
    );

    const returnStatement = ts.factory.createReturnStatement(
      ts.factory.createIdentifier('formData'),
    );

    return ts.factory.createFunctionDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      undefined,
      'toFormData',
      undefined,
      [
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          'obj',
          undefined,
          this.typeBuilder.createReference('Record', [
            this.typeBuilder.createPrimitive('string'),
            this.typeBuilder.createPrimitive('any'),
          ]),
        ),
      ],
      this.typeBuilder.createReference('FormData'),
      ts.factory.createBlock([formDataDecl, forOfStatement, returnStatement], true),
    );
  }

  private buildLoopBody(): ts.Block {
    const createAppendCall = (args: ts.Expression[]) =>
      ts.factory.createExpressionStatement(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier('formData'),
            'append',
          ),
          undefined,
          args,
        ),
      );

    // Skip nullish values early to avoid appending empty entries.
    const isUndefOrNull = ts.factory.createBinaryExpression(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createIdentifier('undefined'),
      ),
      ts.SyntaxKind.BarBarToken,
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createNull(),
      ),
    );
    const ifUndefReturn = ts.factory.createIfStatement(
      isUndefOrNull,
      ts.factory.createBlock([ts.factory.createContinueStatement()], true),
    );

    // Raw Buffer: append directly with the field key as filename.
    const isBuffer = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Buffer'), 'isBuffer'),
      undefined,
      [ts.factory.createIdentifier('value')],
    );
    const bufferBlock = ts.factory.createBlock(
      [
        createAppendCall([
          ts.factory.createIdentifier('key'),
          ts.factory.createIdentifier('value'),
          ts.factory.createIdentifier('key'),
        ]),
      ],
      true,
    );

    // Readable stream: append directly with the field key as filename.
    const isReadable = ts.factory.createBinaryExpression(
      ts.factory.createIdentifier('value'),
      ts.SyntaxKind.InstanceOfKeyword,
      ts.factory.createIdentifier('Readable'),
    );
    const readableBlock = ts.factory.createBlock(
      [
        createAppendCall([
          ts.factory.createIdentifier('key'),
          ts.factory.createIdentifier('value'),
          ts.factory.createIdentifier('key'),
        ]),
      ],
      true,
    );

    // File-like object (e.g., a TypedArray wrapper): extract the underlying Buffer and
    // forward optional metadata so the multipart entry carries the correct content-type.
    const isObjectWithBuffer = ts.factory.createBinaryExpression(
      ts.factory.createBinaryExpression(
        ts.factory.createBinaryExpression(
          ts.factory.createTypeOfExpression(ts.factory.createIdentifier('value')),
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.factory.createStringLiteral('object'),
        ),
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('value'), 'buffer'),
      ),
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier('Buffer'),
          'isBuffer',
        ),
        undefined,
        [ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('value'), 'buffer')],
      ),
    );

    const objBufferBlock = ts.factory.createBlock(
      [
        ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                'options',
                undefined,
                this.typeBuilder.createPrimitive('any'),
                ts.factory.createObjectLiteralExpression(
                  [
                    ts.factory.createPropertyAssignment(
                      'filename',
                      ts.factory.createBinaryExpression(
                        ts.factory.createPropertyAccessExpression(
                          ts.factory.createIdentifier('value'),
                          'filename',
                        ),
                        ts.SyntaxKind.BarBarToken,
                        ts.factory.createIdentifier('key'),
                      ),
                    ),
                  ],
                  false,
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
        ts.factory.createIfStatement(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier('value'),
            'contentType',
          ),
          ts.factory.createBlock(
            [
              ts.factory.createExpressionStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier('options'),
                    'contentType',
                  ),
                  ts.SyntaxKind.EqualsToken,
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier('value'),
                    'contentType',
                  ),
                ),
              ),
            ],
            true,
          ),
        ),
        createAppendCall([
          ts.factory.createIdentifier('key'),
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('value'), 'buffer'),
          ts.factory.createIdentifier('options'),
        ]),
      ],
      true,
    );

    // Array: append each item individually to preserve multi-value field semantics.
    const isArray = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Array'), 'isArray'),
      undefined,
      [ts.factory.createIdentifier('value')],
    );

    const arrayLoop = ts.factory.createForOfStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration('item')],
        ts.NodeFlags.Const,
      ),
      ts.factory.createIdentifier('value'),
      ts.factory.createBlock(
        [
          ts.factory.createIfStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('Buffer'),
                'isBuffer',
              ),
              undefined,
              [ts.factory.createIdentifier('item')],
            ),
            ts.factory.createBlock(
              [
                createAppendCall([
                  ts.factory.createIdentifier('key'),
                  ts.factory.createIdentifier('item'),
                  ts.factory.createIdentifier('key'),
                ]),
              ],
              true,
            ),
            ts.factory.createBlock(
              [
                createAppendCall([
                  ts.factory.createIdentifier('key'),
                  ts.factory.createCallExpression(
                    ts.factory.createIdentifier('String'),
                    undefined,
                    [ts.factory.createIdentifier('item')],
                  ),
                ]),
              ],
              true,
            ),
          ),
        ],
        true,
      ),
    );
    const arrayBlock = ts.factory.createBlock([arrayLoop], true);

    // Plain object: serialize to a JSON string so it can be transported as a form field.
    const isObject = ts.factory.createBinaryExpression(
      ts.factory.createTypeOfExpression(ts.factory.createIdentifier('value')),
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.factory.createStringLiteral('object'),
    );
    const objectBlock = ts.factory.createBlock(
      [
        createAppendCall([
          ts.factory.createIdentifier('key'),
          ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('JSON'),
              'stringify',
            ),
            undefined,
            [ts.factory.createIdentifier('value')],
          ),
        ]),
      ],
      true,
    );

    // Primitive fallback: coerce the value to a string.
    const elseBlock = ts.factory.createBlock(
      [
        createAppendCall([
          ts.factory.createIdentifier('key'),
          ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [
            ts.factory.createIdentifier('value'),
          ]),
        ]),
      ],
      true,
    );

    let currentIf = ts.factory.createIfStatement(isObject, objectBlock, elseBlock);
    currentIf = ts.factory.createIfStatement(isArray, arrayBlock, currentIf);
    currentIf = ts.factory.createIfStatement(isObjectWithBuffer, objBufferBlock, currentIf);
    currentIf = ts.factory.createIfStatement(isReadable, readableBlock, currentIf);
    const mainIfElseChain = ts.factory.createIfStatement(isBuffer, bufferBlock, currentIf);

    return ts.factory.createBlock([ifUndefReturn, mainIfElseChain], true);
  }
}
