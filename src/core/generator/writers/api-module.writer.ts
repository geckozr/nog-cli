import ts from 'typescript';

import { toPascalCase } from '../../../utils/naming';
import { IrService } from '../../ir';
import { AstPrinter, IAstPrintedFile } from './core/ast-printer';
import { DecoratorBuilder } from './core/decorator-builder';
import { HeaderGenerator } from './core/header-generator';
import { ImportBuilder } from './core/import-builder';
import { TypeBuilder } from './core/type-builder';

export class ApiModuleWriter {
  constructor(
    private readonly printer: AstPrinter,
    private readonly headerGenerator: HeaderGenerator,
    private readonly importBuilder: ImportBuilder,
    private readonly typeBuilder: TypeBuilder,
    private readonly decoratorBuilder: DecoratorBuilder,
  ) {}

  /**
   * Generates the `api.module.ts` NestJS dynamic module. The configuration
   * providers (`API_CONFIG`, `ApiConfiguration`, `RequestBuilder`) live
   * directly on the module so each `forRoot[Async]` invocation owns its own
   * config — two distinct registrations stay isolated under NestJS v11
   * reference-equality dedup. `HttpModule.registerAsync` receives the async
   * config providers via `extraProviders`, by reference to the same array
   * spread into the module's own `providers`, so the consumer `useFactory`
   * runs exactly once per registration.
   *
   * @param services - IR services to register as providers and exports in the module.
   * @param moduleName - Base module name used to derive the PascalCase class name.
   * @param cliVersion - Version of the CLI tool, written into the file header.
   * @param specTitle - Title of the OpenAPI specification, written into the file header.
   * @param specVersion - Version of the OpenAPI specification, written into the file header.
   * @returns File name and rendered TypeScript source content.
   */
  public async write(
    services: IrService[],
    moduleName: string,
    cliVersion: string,
    specTitle: string,
    specVersion: string,
  ): Promise<IAstPrintedFile> {
    const safeModuleName = `${toPascalCase(moduleName)}Module`;
    const serviceNames = services.map((s) => s.name).sort();

    const importNodes: ts.ImportDeclaration[] = [];
    importNodes.push(
      this.importBuilder.createNamedImport('@nestjs/common', [
        'Module',
        'DynamicModule',
        'Provider',
        'Type',
      ]),
    );
    importNodes.push(this.importBuilder.createNamedImport('@nestjs/axios', ['HttpModule']));
    importNodes.push(
      this.importBuilder.createNamedImport('./api.configuration', ['ApiConfiguration']),
    );
    importNodes.push(
      this.importBuilder.createNamedImport('./request-builder.service', ['RequestBuilder']),
    );
    importNodes.push(
      this.importBuilder.createNamedImport('./api.types', [
        'API_CONFIG',
        'ApiModuleAsyncConfig',
        'ApiModuleConfig',
        'ApiModuleConfigFactory',
      ]),
    );

    for (const service of services) {
      importNodes.push(
        this.importBuilder.createNamedImport(`./services/${service.fileName}`, [service.name]),
      );
    }

    const classNode = ts.factory.createClassDeclaration(
      [
        this.decoratorBuilder.create('Module', [
          ts.factory.createObjectLiteralExpression([], false),
        ]),
        ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
      ],
      safeModuleName,
      undefined,
      undefined,
      [
        this.buildForRoot(safeModuleName, serviceNames),
        this.buildForRootAsync(safeModuleName, serviceNames),
      ],
    );

    const helperFunctionNode = this.buildCreateAsyncProvidersFunction();

    const fileNodes = [...importNodes, classNode, helperFunctionNode];
    const nodesWithHeader = this.headerGenerator.addHeader(
      fileNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    return this.printer.print(nodesWithHeader, 'api.module.ts');
  }

  private buildAxiosConfigLiteral(): ts.ObjectLiteralExpression {
    return ts.factory.createObjectLiteralExpression(
      [
        ts.factory.createPropertyAssignment(
          'baseURL',
          ts.factory.createBinaryExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('config'),
              'baseUrl',
            ),
            ts.SyntaxKind.QuestionQuestionToken,
            ts.factory.createStringLiteral(''),
          ),
        ),
        ts.factory.createPropertyAssignment(
          'headers',
          ts.factory.createBinaryExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('config'),
              'headers',
            ),
            ts.SyntaxKind.QuestionQuestionToken,
            ts.factory.createObjectLiteralExpression(),
          ),
        ),
        ts.factory.createPropertyAssignment(
          'paramsSerializer',
          ts.factory.createObjectLiteralExpression(
            [ts.factory.createPropertyAssignment('indexes', ts.factory.createNull())],
            false,
          ),
        ),
        ts.factory.createSpreadAssignment(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier('config'),
            'httpOptions',
          ),
        ),
      ],
      true,
    );
  }

  private buildForRoot(moduleName: string, serviceNames: string[]): ts.MethodDeclaration {
    const configParam = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'config',
      undefined,
      this.typeBuilder.createReference('ApiModuleConfig'),
      ts.factory.createObjectLiteralExpression(),
    );

    const importsLiteral = ts.factory.createArrayLiteralExpression(
      [this.buildHttpModuleRegisterSync()],
      true,
    );

    const apiConfigProvider = ts.factory.createObjectLiteralExpression(
      [
        ts.factory.createPropertyAssignment('provide', ts.factory.createIdentifier('API_CONFIG')),
        ts.factory.createPropertyAssignment('useValue', ts.factory.createIdentifier('config')),
      ],
      true,
    );

    const providersLiteral = ts.factory.createArrayLiteralExpression(
      [
        ts.factory.createIdentifier('ApiConfiguration'),
        ts.factory.createIdentifier('RequestBuilder'),
        apiConfigProvider,
        ...serviceNames.map((name) => ts.factory.createIdentifier(name)),
      ],
      true,
    );

    const exportsLiteral = ts.factory.createArrayLiteralExpression(
      [
        ts.factory.createIdentifier('API_CONFIG'),
        ts.factory.createIdentifier('ApiConfiguration'),
        ts.factory.createIdentifier('RequestBuilder'),
        ts.factory.createIdentifier('HttpModule'),
        ...serviceNames.map((name) => ts.factory.createIdentifier(name)),
      ],
      true,
    );

    const returnStatement = ts.factory.createReturnStatement(
      ts.factory.createObjectLiteralExpression(
        [
          ts.factory.createPropertyAssignment('module', ts.factory.createIdentifier(moduleName)),
          ts.factory.createPropertyAssignment('imports', importsLiteral),
          ts.factory.createPropertyAssignment('providers', providersLiteral),
          ts.factory.createPropertyAssignment('exports', exportsLiteral),
        ],
        true,
      ),
    );

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.StaticKeyword)],
      undefined,
      'forRoot',
      undefined,
      undefined,
      [configParam],
      this.typeBuilder.createReference('DynamicModule'),
      ts.factory.createBlock([returnStatement], true),
    );
  }

  private buildForRootAsync(moduleName: string, serviceNames: string[]): ts.MethodDeclaration {
    const asyncProvidersDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'asyncProviders',
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier('createAsyncProviders'),
              undefined,
              [ts.factory.createIdentifier('options')],
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const importsDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'imports',
            undefined,
            undefined,
            ts.factory.createBinaryExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('options'),
                'imports',
              ),
              ts.SyntaxKind.QuestionQuestionToken,
              ts.factory.createArrayLiteralExpression(),
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const importsLiteral = ts.factory.createArrayLiteralExpression(
      [
        ts.factory.createSpreadElement(ts.factory.createIdentifier('imports')),
        this.buildHttpModuleRegisterAsync(),
      ],
      true,
    );

    const providersLiteral = ts.factory.createArrayLiteralExpression(
      [
        ts.factory.createIdentifier('ApiConfiguration'),
        ts.factory.createIdentifier('RequestBuilder'),
        ts.factory.createSpreadElement(ts.factory.createIdentifier('asyncProviders')),
        ...serviceNames.map((name) => ts.factory.createIdentifier(name)),
      ],
      true,
    );

    const exportsLiteral = ts.factory.createArrayLiteralExpression(
      [
        ts.factory.createIdentifier('API_CONFIG'),
        ts.factory.createIdentifier('ApiConfiguration'),
        ts.factory.createIdentifier('RequestBuilder'),
        ts.factory.createIdentifier('HttpModule'),
        ...serviceNames.map((name) => ts.factory.createIdentifier(name)),
      ],
      true,
    );

    const returnStatement = ts.factory.createReturnStatement(
      ts.factory.createObjectLiteralExpression(
        [
          ts.factory.createPropertyAssignment('module', ts.factory.createIdentifier(moduleName)),
          ts.factory.createPropertyAssignment('imports', importsLiteral),
          ts.factory.createPropertyAssignment('providers', providersLiteral),
          ts.factory.createPropertyAssignment('exports', exportsLiteral),
        ],
        true,
      ),
    );

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.StaticKeyword)],
      undefined,
      'forRootAsync',
      undefined,
      undefined,
      [
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          'options',
          undefined,
          this.typeBuilder.createReference('ApiModuleAsyncConfig'),
        ),
      ],
      this.typeBuilder.createReference('DynamicModule'),
      ts.factory.createBlock([asyncProvidersDecl, importsDecl, returnStatement], true),
    );
  }

  private buildHttpModuleRegisterSync(): ts.CallExpression {
    return ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier('HttpModule'),
        'register',
      ),
      undefined,
      [this.buildAxiosConfigLiteral()],
    );
  }

  /**
   * `HttpModule.registerAsync({...})` consumed by `forRootAsync`. The async
   * `API_CONFIG` provider is propagated into HttpModule's scope via
   * `extraProviders` — same reference as the array spread into the module's
   * own `providers`, so NestJS instantiates it once and the consumer
   * `useFactory` runs exactly once per registration.
   */
  private buildHttpModuleRegisterAsync(): ts.CallExpression {
    return ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier('HttpModule'),
        'registerAsync',
      ),
      undefined,
      [
        ts.factory.createObjectLiteralExpression(
          [
            ts.factory.createShorthandPropertyAssignment('imports'),
            ts.factory.createPropertyAssignment(
              'inject',
              ts.factory.createArrayLiteralExpression(
                [ts.factory.createIdentifier('API_CONFIG')],
                false,
              ),
            ),
            ts.factory.createPropertyAssignment(
              'extraProviders',
              ts.factory.createIdentifier('asyncProviders'),
            ),
            ts.factory.createPropertyAssignment(
              'useFactory',
              ts.factory.createArrowFunction(
                [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
                undefined,
                [
                  ts.factory.createParameterDeclaration(
                    undefined,
                    undefined,
                    'config',
                    undefined,
                    this.typeBuilder.createReference('ApiModuleConfig'),
                  ),
                ],
                undefined,
                ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                ts.factory.createParenthesizedExpression(this.buildAxiosConfigLiteral()),
              ),
            ),
          ],
          true,
        ),
      ],
    );
  }

  /**
   * Builds the `createAsyncProviders` helper function — translates an
   * `ApiModuleAsyncConfig` (`useFactory` / `useClass` / `useExisting`) into a
   * concrete `Provider[]`. Lives alongside the module so the resulting array
   * can be shared by reference between `ApiModule.providers` and
   * `HttpModule.registerAsync({ extraProviders })`.
   */
  private buildCreateAsyncProvidersFunction(): ts.FunctionDeclaration {
    const ifUseFactory = ts.factory.createIfStatement(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier('options'),
        'useFactory',
      ),
      ts.factory.createBlock(
        [
          ts.factory.createReturnStatement(
            ts.factory.createArrayLiteralExpression(
              [
                ts.factory.createObjectLiteralExpression(
                  [
                    ts.factory.createPropertyAssignment(
                      'provide',
                      ts.factory.createIdentifier('API_CONFIG'),
                    ),
                    ts.factory.createPropertyAssignment(
                      'useFactory',
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('options'),
                        'useFactory',
                      ),
                    ),
                    ts.factory.createPropertyAssignment(
                      'inject',
                      ts.factory.createBinaryExpression(
                        ts.factory.createPropertyAccessExpression(
                          ts.factory.createIdentifier('options'),
                          'inject',
                        ),
                        ts.SyntaxKind.QuestionQuestionToken,
                        ts.factory.createArrayLiteralExpression([]),
                      ),
                    ),
                  ],
                  true,
                ),
                ts.factory.createSpreadElement(
                  ts.factory.createParenthesizedExpression(
                    ts.factory.createBinaryExpression(
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('options'),
                        'extraProviders',
                      ),
                      ts.SyntaxKind.QuestionQuestionToken,
                      ts.factory.createArrayLiteralExpression([]),
                    ),
                  ),
                ),
              ],
              true,
            ),
          ),
        ],
        true,
      ),
    );

    const injectDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'inject',
            undefined,
            this.typeBuilder.createArray(
              ts.factory.createUnionTypeNode([
                this.typeBuilder.createReference('Type', [
                  this.typeBuilder.createReference('ApiModuleConfigFactory'),
                ]),
                this.typeBuilder.createPrimitive('string'),
                ts.factory.createTypeReferenceNode('symbol'),
              ]),
            ),
            ts.factory.createArrayLiteralExpression([]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const ifUseExisting = ts.factory.createIfStatement(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier('options'),
        'useExisting',
      ),
      ts.factory.createExpressionStatement(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('inject'), 'push'),
          undefined,
          [
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('options'),
              'useExisting',
            ),
          ],
        ),
      ),
    );

    const ifUseClass1 = ts.factory.createIfStatement(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('options'), 'useClass'),
      ts.factory.createExpressionStatement(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('inject'), 'push'),
          undefined,
          [
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('options'),
              'useClass',
            ),
          ],
        ),
      ),
    );

    const asyncProviderDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'asyncProvider',
            undefined,
            this.typeBuilder.createReference('Provider'),
            ts.factory.createObjectLiteralExpression(
              [
                ts.factory.createPropertyAssignment(
                  'provide',
                  ts.factory.createIdentifier('API_CONFIG'),
                ),
                ts.factory.createPropertyAssignment(
                  'useFactory',
                  ts.factory.createArrowFunction(
                    [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
                    undefined,
                    [
                      ts.factory.createParameterDeclaration(
                        undefined,
                        undefined,
                        'factory',
                        undefined,
                        this.typeBuilder.createReference('ApiModuleConfigFactory'),
                      ),
                    ],
                    undefined,
                    ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    ts.factory.createCallExpression(
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('factory'),
                        'createApiModuleConfig',
                      ),
                      undefined,
                      [],
                    ),
                  ),
                ),
                ts.factory.createShorthandPropertyAssignment('inject'),
              ],
              true,
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const providersDecl = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'providers',
            undefined,
            this.typeBuilder.createArray(this.typeBuilder.createReference('Provider')),
            ts.factory.createArrayLiteralExpression(
              [
                ts.factory.createIdentifier('asyncProvider'),
                ts.factory.createSpreadElement(
                  ts.factory.createParenthesizedExpression(
                    ts.factory.createBinaryExpression(
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('options'),
                        'extraProviders',
                      ),
                      ts.SyntaxKind.QuestionQuestionToken,
                      ts.factory.createArrayLiteralExpression([]),
                    ),
                  ),
                ),
              ],
              true,
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    const ifUseClass2 = ts.factory.createIfStatement(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('options'), 'useClass'),
      ts.factory.createBlock(
        [
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('providers'),
                'unshift',
              ),
              undefined,
              [
                ts.factory.createObjectLiteralExpression(
                  [
                    ts.factory.createPropertyAssignment(
                      'provide',
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('options'),
                        'useClass',
                      ),
                    ),
                    ts.factory.createPropertyAssignment(
                      'useClass',
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('options'),
                        'useClass',
                      ),
                    ),
                  ],
                  true,
                ),
              ],
            ),
          ),
        ],
        true,
      ),
    );

    const returnProviders = ts.factory.createReturnStatement(
      ts.factory.createIdentifier('providers'),
    );

    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      'createAsyncProviders',
      undefined,
      [
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          'options',
          undefined,
          this.typeBuilder.createReference('ApiModuleAsyncConfig'),
        ),
      ],
      this.typeBuilder.createArray(this.typeBuilder.createReference('Provider')),
      ts.factory.createBlock(
        [
          ifUseFactory,
          injectDecl,
          ifUseExisting,
          ifUseClass1,
          asyncProviderDecl,
          providersDecl,
          ifUseClass2,
          returnProviders,
        ],
        true,
      ),
    );
  }
}
