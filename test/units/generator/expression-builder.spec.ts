import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { ExpressionBuilder } from '../../../src/core/generator/writers/core/expression-builder';

describe('ExpressionBuilder', () => {
  let builder: ExpressionBuilder;
  let printer: AstPrinter;

  beforeEach(() => {
    builder = new ExpressionBuilder();
    printer = new AstPrinter();
  });

  // Helper function to print an expression node for easier assertions
  const printExpr = async (expr: ts.Expression) => {
    const statement = ts.factory.createExpressionStatement(expr);
    const output = await printer.print([statement]);
    // Remove the trailing semicolon and newline added by the printer for expression statements
    return output.generatedCode.replace(/;\n$/, '');
  };

  it('should create an arrow function returning an identifier', async () => {
    const node = builder.createArrowFunctionReturningIdentifier('GuardDogTraits');
    expect(await printExpr(node)).toBe('() => GuardDogTraits');
  });

  it('should create an object literal', async () => {
    const node = builder.createObjectLiteral({
      keepDiscriminatorProperty: builder.createBooleanLiteral(true),
      property: builder.createStringLiteral('traitType'),
    });

    const output = await printExpr(node);
    expect(output).toContain('keepDiscriminatorProperty: true');
    expect(output).toContain("property: 'traitType'");
  });

  it('should create a boolean literal', async () => {
    const trueNode = builder.createBooleanLiteral(true);
    const falseNode = builder.createBooleanLiteral(false);
    const falsishNode = builder.createBooleanLiteral(null as unknown as boolean); // Type assertion to bypass type checking for testing purposes

    expect(await printExpr(trueNode)).toBe('true');
    expect(await printExpr(falseNode)).toBe('false');
    expect(await printExpr(falsishNode)).toBe('false'); // Should still be false even if input is a string
  });

  it('should create an array literal', async () => {
    const node = builder.createArrayLiteral([
      builder.createStringLiteral('a'),
      builder.createIdentifier('b'),
    ]);
    expect(await printExpr(node)).toBe("['a', b]");
  });
});
