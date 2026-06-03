import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { CommentModifier } from '../../../src/core/generator/writers/core/comment-modifier';
import { PropertyBuilder } from '../../../src/core/generator/writers/core/property-builder';

/** Wraps a property declaration in a minimal class so Prettier can parse it as valid TypeScript. */
const wrapInClass = (property: ts.PropertyDeclaration): ts.ClassDeclaration =>
  ts.factory.createClassDeclaration(
    undefined,
    ts.factory.createIdentifier('DummyClass'),
    undefined,
    undefined,
    [property],
  );

describe('PropertyBuilder', () => {
  let propertyBuilder: PropertyBuilder;
  let commentModifier: CommentModifier;
  let printer: AstPrinter;
  let stringTypeNode: ts.TypeNode;

  beforeEach(() => {
    commentModifier = new CommentModifier();
    propertyBuilder = new PropertyBuilder(commentModifier);
    printer = new AstPrinter();

    stringTypeNode = ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
  });

  it('should create a basic public property', async () => {
    const node = propertyBuilder.create('firstName', stringTypeNode);
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain('public firstName!: string;');
  });

  it('should create an optional property with a question mark', async () => {
    const node = propertyBuilder.create('lastName', stringTypeNode, { isOptional: true });
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain('public lastName?: string;');
  });

  it('should create a readonly property', async () => {
    const node = propertyBuilder.create('id', stringTypeNode, { isReadonly: true });
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain('public readonly id!: string;');
  });

  it('should attach decorators before the public modifier', async () => {
    const mockDecorator = ts.factory.createDecorator(
      ts.factory.createCallExpression(ts.factory.createIdentifier('IsString'), undefined, []),
    );

    const node = propertyBuilder.create('username', stringTypeNode, {
      decorators: [mockDecorator],
    });
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain('@IsString()');
    expect(result.generatedCode).toContain('public username!: string;');
  });

  it('should attach a JSDoc comment if description is provided', async () => {
    const node = propertyBuilder.create('email', stringTypeNode, {
      description: 'The user email address',
    });
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain('/**\n   * The user email address\n   */');
    expect(result.generatedCode).toContain('public email!: string;');
  });

  it('should emit declare modifier when isRedeclared is true', async () => {
    const node = propertyBuilder.create('inheritedField', stringTypeNode, {
      isRedeclared: true,
      isOptional: true,
    });
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain('declare public inheritedField?: string;');
  });

  it('should omit declare modifier when isRedeclared is false or undefined', async () => {
    const node = propertyBuilder.create('ownField', stringTypeNode, { isOptional: true });
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).not.toContain('declare');
    expect(result.generatedCode).toContain('public ownField?: string;');
  });

  it('should combine all options correctly', async () => {
    const mockDecorator = ts.factory.createDecorator(
      ts.factory.createCallExpression(ts.factory.createIdentifier('IsOptional'), undefined, []),
    );

    const node = propertyBuilder.create('age', stringTypeNode, {
      decorators: [mockDecorator],
      isOptional: true,
      isReadonly: true,
      description: 'Optional readonly age',
    });

    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain('/**\n   * Optional readonly age\n   */');
    expect(result.generatedCode).toContain('@IsOptional()');
    expect(result.generatedCode).toContain('public readonly age?: string;');
  });
});
