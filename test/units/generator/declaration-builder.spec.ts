import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { DeclarationBuilder } from '../../../src/core/generator/writers/core/declaration-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';

describe('DeclarationBuilder', () => {
  let builder: DeclarationBuilder;
  let typeBuilder: TypeBuilder;
  let printer: AstPrinter;

  beforeEach(() => {
    builder = new DeclarationBuilder();
    typeBuilder = new TypeBuilder();
    printer = new AstPrinter();
  });

  const printNode = async (node: ts.Node) => {
    return await printer.print([node]);
  };

  it('should create an exported Type Alias', async () => {
    const stringType = typeBuilder.createPrimitive('string');
    const recordType = typeBuilder.createReference('Record', [stringType, stringType]);

    const node = builder.createTypeAlias('ApiHeaders', recordType);
    const output = await printNode(node);

    expect(output.generatedCode).toContain('export type ApiHeaders = Record<string, string>;');
  });

  it('should create an Interface with property and method signatures', async () => {
    const stringType = typeBuilder.createPrimitive('string');
    const promiseType = typeBuilder.createReference('Promise', [stringType]);

    const prop = builder.createPropertySignature('baseUrl', stringType, true);
    const method = builder.createMethodSignature('getConfig', [], promiseType);

    const node = builder.createInterface('ApiConfig', [prop, method]);
    const output = await printNode(node);

    expect(output.generatedCode).toContain('export interface ApiConfig {');
    expect(output.generatedCode).toContain('baseUrl?: string;');
    expect(output.generatedCode).toContain('getConfig(): Promise<string>;');
    expect(output.generatedCode).toContain('}');
  });

  it('should create an Interface with an extends clause', async () => {
    const extendsClause = builder.createExpressionWithTypeArguments('Pick', [
      typeBuilder.createReference('ModuleMetadata'),
      ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('imports')),
    ]);

    const node = builder.createInterface('ApiAsyncConfig', [], [extendsClause]);
    const output = await printNode(node);

    expect(output.generatedCode).toContain(
      "export interface ApiAsyncConfig extends Pick<ModuleMetadata, 'imports'> {",
    );
  });

  it('should create a function type node', async () => {
    const restParam = ts.factory.createParameterDeclaration(
      undefined,
      ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
      ts.factory.createIdentifier('args'),
      undefined,
      typeBuilder.createArray(typeBuilder.createPrimitive('any')),
    );
    const returnType = typeBuilder.createReference('Promise', [
      typeBuilder.createPrimitive('string'),
    ]);

    const node = builder.createFunctionTypeNode([restParam], returnType);
    const alias = ts.factory.createTypeAliasDeclaration(
      undefined,
      ts.factory.createIdentifier('TestFn'),
      undefined,
      node,
    );
    const output = await printNode(alias);

    expect(output.generatedCode).toContain('(...args: any[]) => Promise<string>');
  });

  it('should create an exported Const variable', async () => {
    const initializer = ts.factory.createCallExpression(
      ts.factory.createIdentifier('Symbol'),
      undefined,
      [ts.factory.createStringLiteral('API_CONFIG')],
    );

    const node = builder.createConstVariable('API_CONFIG', initializer);
    const output = await printNode(node);

    expect(output.generatedCode).toContain("export const API_CONFIG = Symbol('API_CONFIG');");
  });
});
