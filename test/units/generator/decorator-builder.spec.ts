import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { DecoratorBuilder } from '../../../src/core/generator/writers/core/decorator-builder';

/** Wraps a decorator in a minimal class declaration so Prettier can parse it as valid TypeScript. */
const wrapInClass = (decorator: ts.Decorator, name = 'DummyClass'): ts.ClassDeclaration =>
  ts.factory.createClassDeclaration(
    [decorator],
    ts.factory.createIdentifier(name),
    undefined,
    undefined,
    [],
  );

describe('DecoratorBuilder', () => {
  let decoratorBuilder: DecoratorBuilder;
  let printer: AstPrinter;

  beforeEach(() => {
    decoratorBuilder = new DecoratorBuilder();
    printer = new AstPrinter();
  });

  it('should create a simple decorator with no arguments', async () => {
    const node = decoratorBuilder.create('Injectable');
    const result = await printer.print([wrapInClass(node, 'DummyService')]);

    expect(result.generatedCode).toBe('@Injectable()\nclass DummyService {}\n');
  });

  it('should create a decorator with primitive arguments', async () => {
    const args = [ts.factory.createNumericLiteral(10)];
    const node = decoratorBuilder.create('Min', args);
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain('@Min(10)');
  });

  it('should create a complex decorator like @Type', async () => {
    const arrowFunc = ts.factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.factory.createIdentifier('GuardDogTraits'),
    );

    const configObj = ts.factory.createObjectLiteralExpression([
      ts.factory.createPropertyAssignment('keepDiscriminatorProperty', ts.factory.createTrue()),
    ]);

    const node = decoratorBuilder.create('Type', [arrowFunc, configObj]);
    const result = await printer.print([wrapInClass(node)]);

    expect(result.generatedCode).toContain(
      '@Type(() => GuardDogTraits, { keepDiscriminatorProperty: true })',
    );
  });
});
