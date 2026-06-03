import ts from 'typescript';

import { AstPrinter, IAstPrintedFile } from './core/ast-printer';
import { DecoratorBuilder } from './core/decorator-builder';
import { HeaderGenerator } from './core/header-generator';
import { ImportBuilder } from './core/import-builder';
import { TypeBuilder } from './core/type-builder';

/**
 * Emits `request-builder.service.ts`: a stateless `@Injectable()` helper that
 * centralizes URL, query and header construction shared by every generated
 * service method. Consumers can override it via standard NestJS DI to customize
 * encoding behavior across the SDK.
 */
export class RequestBuilderWriter {
  constructor(
    private readonly printer: AstPrinter,
    private readonly headerGenerator: HeaderGenerator,
    private readonly importBuilder: ImportBuilder,
    private readonly typeBuilder: TypeBuilder,
    private readonly decoratorBuilder: DecoratorBuilder,
  ) {}

  /**
   * Generates `request-builder.service.ts`.
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
    const importNodes: ts.ImportDeclaration[] = [
      this.importBuilder.createNamedImport('@nestjs/common', ['Injectable']),
    ];

    const paramStyleTypeNode = this.buildParamStyleType();
    const classNode = this.buildRequestBuilderClass();

    const emptyLineNode = ts.factory.createIdentifier('\n');
    const fileNodes = [...importNodes, emptyLineNode, paramStyleTypeNode, classNode];
    const nodesWithHeader = this.headerGenerator.addHeader(
      fileNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    return this.printer.print(nodesWithHeader, 'request-builder.service.ts');
  }

  private buildParamStyleType(): ts.TypeAliasDeclaration {
    const literal = (text: string): ts.LiteralTypeNode =>
      ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(text));

    return ts.factory.createTypeAliasDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      'ParamStyle',
      undefined,
      ts.factory.createUnionTypeNode([
        literal('csv'),
        literal('space'),
        literal('pipe'),
        literal('deep'),
      ]),
    );
  }

  private buildRequestBuilderClass(): ts.ClassDeclaration {
    const classElements: ts.ClassElement[] = [
      this.buildBuildUrlMethod(),
      this.buildBuildQueryMethod(),
      this.buildBuildHeadersMethod(),
      this.buildSerializeDeepMethod(),
      this.buildStringifyHeaderMethod(),
    ];

    return ts.factory.createClassDeclaration(
      [
        this.decoratorBuilder.create('Injectable'),
        ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
      ],
      'RequestBuilder',
      undefined,
      undefined,
      classElements,
    );
  }

  private buildBuildUrlMethod(): ts.MethodDeclaration {
    const stringType = this.typeBuilder.createPrimitive('string');
    const recordStringUnknown = this.typeBuilder.createReference('Record', [
      this.typeBuilder.createPrimitive('string'),
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
    ]);

    const templateParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'template',
      undefined,
      stringType,
    );
    const pathParamsParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'pathParams',
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      recordStringUnknown,
    );

    const pathDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'path',
            undefined,
            undefined,
            ts.factory.createIdentifier('template'),
          ),
        ],
        ts.NodeFlags.Let,
      ),
    );

    const valueDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'value',
            undefined,
            undefined,
            ts.factory.createElementAccessExpression(
              ts.factory.createIdentifier('pathParams'),
              ts.factory.createIdentifier('key'),
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const isNullOrUndefined = ts.factory.createBinaryExpression(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createNull(),
      ),
      ts.SyntaxKind.BarBarToken,
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createIdentifier('undefined'),
      ),
    );
    const encodedTernary = ts.factory.createConditionalExpression(
      isNullOrUndefined,
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      ts.factory.createStringLiteral(''),
      ts.factory.createToken(ts.SyntaxKind.ColonToken),
      ts.factory.createCallExpression(
        ts.factory.createIdentifier('encodeURIComponent'),
        undefined,
        [
          ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [
            ts.factory.createIdentifier('value'),
          ]),
        ],
      ),
    );
    const encodedDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration('encoded', undefined, undefined, encodedTernary)],
        ts.NodeFlags.Const,
      ),
    );

    const splitTemplate = ts.factory.createTemplateExpression(ts.factory.createTemplateHead('{'), [
      ts.factory.createTemplateSpan(
        ts.factory.createIdentifier('key'),
        ts.factory.createTemplateTail('}'),
      ),
    ]);
    const splitCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('path'), 'split'),
      undefined,
      [splitTemplate],
    );
    const joinCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(splitCall, 'join'),
      undefined,
      [ts.factory.createIdentifier('encoded')],
    );
    const pathAssign = ts.factory.createExpressionStatement(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('path'),
        ts.SyntaxKind.EqualsToken,
        joinCall,
      ),
    );

    const forOfKeys = ts.factory.createForOfStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration('key')],
        ts.NodeFlags.Const,
      ),
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Object'), 'keys'),
        undefined,
        [ts.factory.createIdentifier('pathParams')],
      ),
      ts.factory.createBlock([valueDecl, encodedDecl, pathAssign], true),
    );

    const ifPathParams = ts.factory.createIfStatement(
      ts.factory.createIdentifier('pathParams'),
      ts.factory.createBlock([forOfKeys], true),
    );

    const slashPath = ts.factory.createTemplateExpression(ts.factory.createTemplateHead('/'), [
      ts.factory.createTemplateSpan(
        ts.factory.createIdentifier('path'),
        ts.factory.createTemplateTail(''),
      ),
    ]);
    const suffixDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'suffix',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier('path'),
                  'startsWith',
                ),
                undefined,
                [ts.factory.createStringLiteral('/')],
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createIdentifier('path'),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              slashPath,
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const returnStmt = ts.factory.createReturnStatement(ts.factory.createIdentifier('suffix'));

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword)],
      undefined,
      'buildUrl',
      undefined,
      undefined,
      [templateParam, pathParamsParam],
      stringType,
      ts.factory.createBlock([pathDecl, ifPathParams, suffixDecl, returnStmt], true),
    );
  }

  private buildBuildQueryMethod(): ts.MethodDeclaration {
    const recordStringUnknown = this.typeBuilder.createReference('Record', [
      this.typeBuilder.createPrimitive('string'),
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
    ]);
    const typeParameters: ts.TypeParameterDeclaration[] = [
      ts.factory.createTypeParameterDeclaration(
        undefined,
        'T',
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
      ),
      ts.factory.createTypeParameterDeclaration(
        undefined,
        'K',
        ts.factory.createTypeOperatorNode(
          ts.SyntaxKind.KeyOfKeyword,
          this.typeBuilder.createReference('T'),
        ),
      ),
    ];

    const queryParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'query',
      undefined,
      this.typeBuilder.createUnion([
        this.typeBuilder.createReference('T'),
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
      ]),
    );
    const keysParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'keys',
      undefined,
      ts.factory.createTypeOperatorNode(
        ts.SyntaxKind.ReadonlyKeyword,
        this.typeBuilder.createArray(this.typeBuilder.createReference('K')),
      ),
    );
    const stylesParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'styles',
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      this.typeBuilder.createReference('Partial', [
        this.typeBuilder.createReference('Record', [
          this.typeBuilder.createReference('K'),
          this.typeBuilder.createReference('ParamStyle'),
        ]),
      ]),
    );

    const outDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'out',
            undefined,
            recordStringUnknown,
            ts.factory.createObjectLiteralExpression([], false),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const earlyReturn = ts.factory.createIfStatement(
      ts.factory.createPrefixUnaryExpression(
        ts.SyntaxKind.ExclamationToken,
        ts.factory.createIdentifier('query'),
      ),
      ts.factory.createReturnStatement(ts.factory.createIdentifier('out')),
    );

    const sourceDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'source',
            undefined,
            undefined,
            ts.factory.createAsExpression(
              ts.factory.createIdentifier('query'),
              recordStringUnknown,
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const styleMapType = this.typeBuilder.createUnion([
      this.typeBuilder.createReference('Record', [
        this.typeBuilder.createPrimitive('string'),
        this.typeBuilder.createReference('ParamStyle'),
      ]),
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
    ]);
    const styleMapDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'styleMap',
            undefined,
            undefined,
            ts.factory.createAsExpression(ts.factory.createIdentifier('styles'), styleMapType),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const forBody = this.buildBuildQueryLoopBody();

    const keysAsStringArray = ts.factory.createAsExpression(
      ts.factory.createIdentifier('keys'),
      ts.factory.createTypeOperatorNode(
        ts.SyntaxKind.ReadonlyKeyword,
        this.typeBuilder.createArray(this.typeBuilder.createPrimitive('string')),
      ),
    );
    const forOf = ts.factory.createForOfStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration('k')],
        ts.NodeFlags.Const,
      ),
      keysAsStringArray,
      forBody,
    );

    const returnOut = ts.factory.createReturnStatement(ts.factory.createIdentifier('out'));

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword)],
      undefined,
      'buildQuery',
      undefined,
      typeParameters,
      [queryParam, keysParam, stylesParam],
      recordStringUnknown,
      ts.factory.createBlock(
        [outDecl, earlyReturn, sourceDecl, styleMapDecl, forOf, returnOut],
        true,
      ),
    );
  }

  private buildBuildQueryLoopBody(): ts.Block {
    const valueDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'value',
            undefined,
            undefined,
            ts.factory.createElementAccessExpression(
              ts.factory.createIdentifier('source'),
              ts.factory.createIdentifier('k'),
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const ifUndefinedContinue = ts.factory.createIfStatement(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createIdentifier('undefined'),
      ),
      ts.factory.createContinueStatement(),
    );

    const outAtK = ts.factory.createElementAccessExpression(
      ts.factory.createIdentifier('out'),
      ts.factory.createIdentifier('k'),
    );
    const assignEmpty = ts.factory.createExpressionStatement(
      ts.factory.createBinaryExpression(
        outAtK,
        ts.SyntaxKind.EqualsToken,
        ts.factory.createStringLiteral(''),
      ),
    );
    const ifNullClearAndContinue = ts.factory.createIfStatement(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createNull(),
      ),
      ts.factory.createBlock([assignEmpty, ts.factory.createContinueStatement()], true),
    );

    const styleDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'style',
            undefined,
            undefined,
            ts.factory.createElementAccessChain(
              ts.factory.createIdentifier('styleMap'),
              ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
              ts.factory.createIdentifier('k'),
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const isArrayCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Array'), 'isArray'),
      undefined,
      [ts.factory.createIdentifier('value')],
    );
    const joinWith = (sep: string): ts.ConditionalExpression =>
      ts.factory.createConditionalExpression(
        isArrayCall,
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('value'), 'join'),
          undefined,
          [ts.factory.createStringLiteral(sep)],
        ),
        ts.factory.createToken(ts.SyntaxKind.ColonToken),
        ts.factory.createIdentifier('value'),
      );
    const assignFromExpr = (expr: ts.Expression): ts.ExpressionStatement =>
      ts.factory.createExpressionStatement(
        ts.factory.createBinaryExpression(outAtK, ts.SyntaxKind.EqualsToken, expr),
      );

    const csvBlock = ts.factory.createBlock([assignFromExpr(joinWith(','))], true);
    const spaceBlock = ts.factory.createBlock([assignFromExpr(joinWith(' '))], true);
    const pipeBlock = ts.factory.createBlock([assignFromExpr(joinWith('|'))], true);

    const valueAsRecord = ts.factory.createAsExpression(
      ts.factory.createIdentifier('value'),
      this.typeBuilder.createReference('Record', [
        this.typeBuilder.createPrimitive('string'),
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
      ]),
    );
    const serializeDeepCall = ts.factory.createExpressionStatement(
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'serializeDeep'),
        undefined,
        [ts.factory.createIdentifier('out'), ts.factory.createIdentifier('k'), valueAsRecord],
      ),
    );
    const deepBlock = ts.factory.createBlock([serializeDeepCall], true);

    const defaultBlock = ts.factory.createBlock(
      [assignFromExpr(ts.factory.createIdentifier('value'))],
      true,
    );

    const styleEquals = (literal: string): ts.BinaryExpression =>
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('style'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createStringLiteral(literal),
      );

    const deepCondition = ts.factory.createBinaryExpression(
      ts.factory.createBinaryExpression(
        styleEquals('deep'),
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.factory.createBinaryExpression(
          ts.factory.createTypeOfExpression(ts.factory.createIdentifier('value')),
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.factory.createStringLiteral('object'),
        ),
      ),
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, isArrayCall),
    );

    let chain: ts.IfStatement = ts.factory.createIfStatement(
      deepCondition,
      deepBlock,
      defaultBlock,
    );
    chain = ts.factory.createIfStatement(styleEquals('pipe'), pipeBlock, chain);
    chain = ts.factory.createIfStatement(styleEquals('space'), spaceBlock, chain);
    chain = ts.factory.createIfStatement(styleEquals('csv'), csvBlock, chain);

    return ts.factory.createBlock(
      [valueDecl, ifUndefinedContinue, ifNullClearAndContinue, styleDecl, chain],
      true,
    );
  }

  private buildBuildHeadersMethod(): ts.MethodDeclaration {
    const recordStringString = this.typeBuilder.createReference('Record', [
      this.typeBuilder.createPrimitive('string'),
      this.typeBuilder.createPrimitive('string'),
    ]);
    const recordStringUnknown = this.typeBuilder.createReference('Record', [
      this.typeBuilder.createPrimitive('string'),
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
    ]);

    const typeParameters: ts.TypeParameterDeclaration[] = [
      ts.factory.createTypeParameterDeclaration(
        undefined,
        'T',
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
      ),
      ts.factory.createTypeParameterDeclaration(
        undefined,
        'K',
        ts.factory.createTypeOperatorNode(
          ts.SyntaxKind.KeyOfKeyword,
          this.typeBuilder.createReference('T'),
        ),
      ),
    ];

    const baseParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'base',
      undefined,
      this.typeBuilder.createUnion([
        recordStringString,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
      ]),
    );
    const extrasParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'extras',
      undefined,
      this.typeBuilder.createUnion([
        this.typeBuilder.createReference('T'),
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
      ]),
    );
    const keysParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'keys',
      undefined,
      ts.factory.createTypeOperatorNode(
        ts.SyntaxKind.ReadonlyKeyword,
        this.typeBuilder.createArray(this.typeBuilder.createReference('K')),
      ),
    );

    const outDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'out',
            undefined,
            recordStringString,
            ts.factory.createObjectLiteralExpression(
              [
                ts.factory.createSpreadAssignment(
                  ts.factory.createParenthesizedExpression(
                    ts.factory.createBinaryExpression(
                      ts.factory.createIdentifier('base'),
                      ts.SyntaxKind.QuestionQuestionToken,
                      ts.factory.createObjectLiteralExpression([], false),
                    ),
                  ),
                ),
              ],
              false,
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const earlyReturn = ts.factory.createIfStatement(
      ts.factory.createPrefixUnaryExpression(
        ts.SyntaxKind.ExclamationToken,
        ts.factory.createIdentifier('extras'),
      ),
      ts.factory.createReturnStatement(ts.factory.createIdentifier('out')),
    );

    const sourceDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'source',
            undefined,
            undefined,
            ts.factory.createAsExpression(
              ts.factory.createIdentifier('extras'),
              recordStringUnknown,
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const valueDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'value',
            undefined,
            undefined,
            ts.factory.createElementAccessExpression(
              ts.factory.createIdentifier('source'),
              ts.factory.createIdentifier('k'),
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );
    const ifUndefinedContinue = ts.factory.createIfStatement(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createIdentifier('undefined'),
      ),
      ts.factory.createContinueStatement(),
    );
    const outAtK = ts.factory.createElementAccessExpression(
      ts.factory.createIdentifier('out'),
      ts.factory.createIdentifier('k'),
    );
    const ifNullClearAndContinue = ts.factory.createIfStatement(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createNull(),
      ),
      ts.factory.createBlock(
        [
          ts.factory.createExpressionStatement(
            ts.factory.createBinaryExpression(
              outAtK,
              ts.SyntaxKind.EqualsToken,
              ts.factory.createStringLiteral(''),
            ),
          ),
          ts.factory.createContinueStatement(),
        ],
        true,
      ),
    );
    const assignStringified = ts.factory.createExpressionStatement(
      ts.factory.createBinaryExpression(
        outAtK,
        ts.SyntaxKind.EqualsToken,
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'stringifyHeader'),
          undefined,
          [ts.factory.createIdentifier('value')],
        ),
      ),
    );

    const keysAsStringArray = ts.factory.createAsExpression(
      ts.factory.createIdentifier('keys'),
      ts.factory.createTypeOperatorNode(
        ts.SyntaxKind.ReadonlyKeyword,
        this.typeBuilder.createArray(this.typeBuilder.createPrimitive('string')),
      ),
    );
    const forOf = ts.factory.createForOfStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration('k')],
        ts.NodeFlags.Const,
      ),
      keysAsStringArray,
      ts.factory.createBlock(
        [valueDecl, ifUndefinedContinue, ifNullClearAndContinue, assignStringified],
        true,
      ),
    );

    const returnOut = ts.factory.createReturnStatement(ts.factory.createIdentifier('out'));

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword)],
      undefined,
      'buildHeaders',
      undefined,
      typeParameters,
      [baseParam, extrasParam, keysParam],
      recordStringString,
      ts.factory.createBlock([outDecl, earlyReturn, sourceDecl, forOf, returnOut], true),
    );
  }

  private buildSerializeDeepMethod(): ts.MethodDeclaration {
    const recordStringUnknown = this.typeBuilder.createReference('Record', [
      this.typeBuilder.createPrimitive('string'),
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
    ]);

    const outParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'out',
      undefined,
      recordStringUnknown,
    );
    const nameParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'name',
      undefined,
      this.typeBuilder.createPrimitive('string'),
    );
    const objParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'obj',
      undefined,
      recordStringUnknown,
    );

    const vDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'v',
            undefined,
            undefined,
            ts.factory.createElementAccessExpression(
              ts.factory.createIdentifier('obj'),
              ts.factory.createIdentifier('sub'),
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const isNullOrUndefined = ts.factory.createBinaryExpression(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('v'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createNull(),
      ),
      ts.SyntaxKind.BarBarToken,
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('v'),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createIdentifier('undefined'),
      ),
    );
    const ifNullishContinue = ts.factory.createIfStatement(
      isNullOrUndefined,
      ts.factory.createContinueStatement(),
    );

    const subKeyTemplate = ts.factory.createTemplateExpression(ts.factory.createTemplateHead(''), [
      ts.factory.createTemplateSpan(
        ts.factory.createIdentifier('name'),
        ts.factory.createTemplateMiddle('['),
      ),
      ts.factory.createTemplateSpan(
        ts.factory.createIdentifier('sub'),
        ts.factory.createTemplateTail(']'),
      ),
    ]);
    const outAtSubKey = ts.factory.createElementAccessExpression(
      ts.factory.createIdentifier('out'),
      subKeyTemplate,
    );

    const isArrayCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Array'), 'isArray'),
      undefined,
      [ts.factory.createIdentifier('v')],
    );
    const arrayBlock = ts.factory.createBlock(
      [
        ts.factory.createExpressionStatement(
          ts.factory.createBinaryExpression(
            outAtSubKey,
            ts.SyntaxKind.EqualsToken,
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('v'), 'join'),
              undefined,
              [ts.factory.createStringLiteral(',')],
            ),
          ),
        ),
      ],
      true,
    );

    const isObject = ts.factory.createBinaryExpression(
      ts.factory.createTypeOfExpression(ts.factory.createIdentifier('v')),
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.factory.createStringLiteral('object'),
    );
    const objectBlock = ts.factory.createBlock(
      [
        ts.factory.createExpressionStatement(
          ts.factory.createBinaryExpression(
            outAtSubKey,
            ts.SyntaxKind.EqualsToken,
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('JSON'),
                'stringify',
              ),
              undefined,
              [ts.factory.createIdentifier('v')],
            ),
          ),
        ),
      ],
      true,
    );

    const elseBlock = ts.factory.createBlock(
      [
        ts.factory.createExpressionStatement(
          ts.factory.createBinaryExpression(
            outAtSubKey,
            ts.SyntaxKind.EqualsToken,
            ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [
              ts.factory.createIdentifier('v'),
            ]),
          ),
        ),
      ],
      true,
    );

    const ifElseChain = ts.factory.createIfStatement(
      isArrayCall,
      arrayBlock,
      ts.factory.createIfStatement(isObject, objectBlock, elseBlock),
    );

    const forOf = ts.factory.createForOfStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration('sub')],
        ts.NodeFlags.Const,
      ),
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Object'), 'keys'),
        undefined,
        [ts.factory.createIdentifier('obj')],
      ),
      ts.factory.createBlock([vDecl, ifNullishContinue, ifElseChain], true),
    );

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
      undefined,
      'serializeDeep',
      undefined,
      undefined,
      [outParam, nameParam, objParam],
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
      ts.factory.createBlock([forOf], true),
    );
  }

  private buildStringifyHeaderMethod(): ts.MethodDeclaration {
    const valueParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'value',
      undefined,
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
    );

    const mapArrow = ts.factory.createArrowFunction(
      undefined,
      undefined,
      [ts.factory.createParameterDeclaration(undefined, undefined, 'v')],
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [
        ts.factory.createIdentifier('v'),
      ]),
    );
    const mapCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('value'), 'map'),
      undefined,
      [mapArrow],
    );
    const joinCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(mapCall, 'join'),
      undefined,
      [ts.factory.createStringLiteral(',')],
    );
    const ifArray = ts.factory.createIfStatement(
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Array'), 'isArray'),
        undefined,
        [ts.factory.createIdentifier('value')],
      ),
      ts.factory.createReturnStatement(joinCall),
    );

    const objectCondition = ts.factory.createBinaryExpression(
      ts.factory.createBinaryExpression(
        ts.factory.createTypeOfExpression(ts.factory.createIdentifier('value')),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.factory.createStringLiteral('object'),
      ),
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier('value'),
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.factory.createNull(),
      ),
    );
    const ifObject = ts.factory.createIfStatement(
      objectCondition,
      ts.factory.createReturnStatement(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier('JSON'),
            'stringify',
          ),
          undefined,
          [ts.factory.createIdentifier('value')],
        ),
      ),
    );

    const returnStringify = ts.factory.createReturnStatement(
      ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [
        ts.factory.createIdentifier('value'),
      ]),
    );

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
      undefined,
      'stringifyHeader',
      undefined,
      undefined,
      [valueParam],
      this.typeBuilder.createPrimitive('string'),
      ts.factory.createBlock([ifArray, ifObject, returnStringify], true),
    );
  }
}
