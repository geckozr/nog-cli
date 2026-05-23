import ts from 'typescript';

import { AstPrinter, IAstPrintedFile } from './core/ast-printer';
import { DeclarationBuilder } from './core/declaration-builder';
import { HeaderGenerator } from './core/header-generator';
import { ImportBuilder } from './core/import-builder';
import { TypeBuilder } from './core/type-builder';

export class ApiTypesWriter {
  constructor(
    private readonly printer: AstPrinter,
    private readonly headerGenerator: HeaderGenerator,
    private readonly importBuilder: ImportBuilder,
    private readonly typeBuilder: TypeBuilder,
    private readonly declarationBuilder: DeclarationBuilder,
  ) {}

  /**
   * Generates the `api.types.ts` file containing the shared type aliases,
   * interfaces, and the `API_CONFIG` injection token consumed by the
   * generated NestJS module and configuration.
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
      this.importBuilder.createNamedImport('@nestjs/common', [
        'ModuleMetadata',
        'Provider',
        'Type',
      ]),
      this.importBuilder.createNamedImport('axios', ['AxiosRequestConfig']),
    ];

    const apiHeadersAlias = this.declarationBuilder.createTypeAlias(
      'ApiHeaders',
      this.typeBuilder.createReference('Record', [
        this.typeBuilder.createPrimitive('string'),
        this.typeBuilder.createPrimitive('string'),
      ]),
    );

    const apiModuleConfigInterface = this.declarationBuilder.createInterface('ApiModuleConfig', [
      this.declarationBuilder.createPropertySignature(
        'baseUrl',
        this.typeBuilder.createPrimitive('string'),
        true,
      ),
      this.declarationBuilder.createPropertySignature(
        'headers',
        this.typeBuilder.createReference('ApiHeaders'),
        true,
      ),
      this.declarationBuilder.createPropertySignature(
        'httpOptions',
        this.typeBuilder.createReference('AxiosRequestConfig'),
        true,
      ),
    ]);

    const apiModuleConfigUnion = this.typeBuilder.createUnion([
      this.typeBuilder.createReference('Promise', [
        this.typeBuilder.createReference('ApiModuleConfig'),
      ]),
      this.typeBuilder.createReference('ApiModuleConfig'),
    ]);

    const apiModuleConfigFactoryInterface = this.declarationBuilder.createInterface(
      'ApiModuleConfigFactory',
      [
        this.declarationBuilder.createMethodSignature(
          'createApiModuleConfig',
          [],
          apiModuleConfigUnion,
        ),
      ],
    );

    const apiModuleAsyncConfigInterface = this.declarationBuilder.createInterface(
      'ApiModuleAsyncConfig',
      [
        this.declarationBuilder.createPropertySignature(
          'useExisting',
          this.typeBuilder.createReference('Type', [
            this.typeBuilder.createReference('ApiModuleConfigFactory'),
          ]),
          true,
        ),
        this.declarationBuilder.createPropertySignature(
          'useClass',
          this.typeBuilder.createReference('Type', [
            this.typeBuilder.createReference('ApiModuleConfigFactory'),
          ]),
          true,
        ),
        this.declarationBuilder.createPropertySignature(
          'useFactory',
          this.buildUseFactoryType(apiModuleConfigUnion),
          true,
        ),
        this.declarationBuilder.createPropertySignature('inject', this.buildInjectType(), true),
        this.declarationBuilder.createPropertySignature(
          'extraProviders',
          this.typeBuilder.createArray(this.typeBuilder.createReference('Provider')),
          true,
        ),
      ],
      [
        this.declarationBuilder.createExpressionWithTypeArguments('Pick', [
          this.typeBuilder.createReference('ModuleMetadata'),
          ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('imports')),
        ]),
      ],
    );

    const apiConfigToken = this.declarationBuilder.createConstVariable(
      'API_CONFIG',
      ts.factory.createCallExpression(ts.factory.createIdentifier('Symbol'), undefined, [
        ts.factory.createStringLiteral('API_CONFIG'),
      ]),
    );

    const emptyLineNode = ts.factory.createIdentifier('\n');
    const fileNodes: ts.Node[] = [
      ...importNodes,
      emptyLineNode,
      apiHeadersAlias,
      apiModuleConfigInterface,
      apiModuleConfigFactoryInterface,
      apiModuleAsyncConfigInterface,
      apiConfigToken,
    ];

    const nodesWithHeader = this.headerGenerator.addHeader(
      fileNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    return this.printer.print(nodesWithHeader, 'api.types.ts');
  }

  private buildUseFactoryType(returnType: ts.TypeNode): ts.FunctionTypeNode {
    const restParameter = ts.factory.createParameterDeclaration(
      undefined,
      ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
      'args',
      undefined,
      this.typeBuilder.createArray(ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)),
    );

    return this.declarationBuilder.createFunctionTypeNode([restParameter], returnType);
  }

  private buildInjectType(): ts.TypeReferenceNode {
    const injectElement = this.typeBuilder.createUnion([
      this.typeBuilder.createPrimitive('string'),
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.SymbolKeyword),
      this.typeBuilder.createReference('Type', [
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
      ]),
    ]);

    return this.typeBuilder.createReference('Array', [injectElement]);
  }
}
