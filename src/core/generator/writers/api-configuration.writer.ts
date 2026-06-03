import ts from 'typescript';

import { AstPrinter, IAstPrintedFile } from './core/ast-printer';
import { DecoratorBuilder } from './core/decorator-builder';
import { HeaderGenerator } from './core/header-generator';
import { ImportBuilder } from './core/import-builder';
import { TypeBuilder } from './core/type-builder';

export class ApiConfigurationWriter {
  constructor(
    private readonly printer: AstPrinter,
    private readonly headerGenerator: HeaderGenerator,
    private readonly importBuilder: ImportBuilder,
    private readonly typeBuilder: TypeBuilder,
    private readonly decoratorBuilder: DecoratorBuilder,
  ) {}

  public async write(
    cliVersion: string,
    specTitle: string,
    specVersion: string,
  ): Promise<IAstPrintedFile> {
    const importNodes: ts.ImportDeclaration[] = [];

    importNodes.push(
      this.importBuilder.createNamedImport('@nestjs/common', ['Injectable', 'Inject']),
    );
    importNodes.push(this.importBuilder.createNamedImport('axios', ['AxiosRequestConfig']));
    importNodes.push(
      this.importBuilder.createNamedImport('./api.types', [
        'API_CONFIG',
        'ApiModuleConfig',
        'ApiHeaders',
      ]),
    );

    const classElements: ts.ClassElement[] = [];

    const injectDecorator = this.decoratorBuilder.create('Inject', [
      ts.factory.createIdentifier('API_CONFIG'),
    ]);

    // `private readonly config: ApiModuleConfig = {}` — parameter property with a
    // default value. Removes the previous body-side `this.config = config ?? {}`
    // and makes `this.config` non-optional at the type level, so the getters and
    // buildUrl can drop their optional-chaining.
    const constructorParam = ts.factory.createParameterDeclaration(
      [
        injectDecorator,
        ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword),
        ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword),
      ],
      undefined,
      'config',
      undefined,
      this.typeBuilder.createReference('ApiModuleConfig'),
      ts.factory.createObjectLiteralExpression(),
    );

    classElements.push(
      ts.factory.createConstructorDeclaration(
        undefined,
        [constructorParam],
        ts.factory.createBlock([], false),
      ),
    );

    const createGetter = (name: string, returnType: ts.TypeNode, fallback: ts.Expression) => {
      return ts.factory.createGetAccessorDeclaration(
        undefined,
        name,
        [],
        returnType,
        ts.factory.createBlock(
          [
            ts.factory.createReturnStatement(
              ts.factory.createBinaryExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'config'),
                  ts.factory.createIdentifier(name),
                ),
                ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
                fallback,
              ),
            ),
          ],
          true,
        ),
      );
    };

    classElements.push(
      createGetter(
        'baseUrl',
        this.typeBuilder.createPrimitive('string'),
        ts.factory.createStringLiteral(''),
      ),
    );

    classElements.push(
      createGetter(
        'headers',
        this.typeBuilder.createReference('ApiHeaders'),
        ts.factory.createObjectLiteralExpression(),
      ),
    );

    classElements.push(
      createGetter(
        'httpOptions',
        this.typeBuilder.createReference('AxiosRequestConfig'),
        ts.factory.createObjectLiteralExpression(),
      ),
    );

    const classNode = ts.factory.createClassDeclaration(
      [
        this.decoratorBuilder.create('Injectable'),
        ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
      ],
      'ApiConfiguration',
      undefined,
      undefined,
      classElements,
    );

    const emptyLineNode = ts.factory.createIdentifier('\n');
    const fileNodes = [...importNodes, emptyLineNode, classNode];
    const nodesWithHeader = this.headerGenerator.addHeader(
      fileNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    return this.printer.print(nodesWithHeader, 'api.configuration.ts');
  }
}
