import ts from 'typescript';

/**
 * Utility class for building complex TypeScript expressions (objects, arrays, functions).
 * Designed to be injected via DI.
 */
export class ExpressionBuilder {
  /**
   * Creates an arrow function that returns an identifier.
   * @example () => GuardDogTraits
   */
  public createArrowFunctionReturningIdentifier(identifierName: string): ts.ArrowFunction {
    return ts.factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.factory.createIdentifier(identifierName),
    );
  }

  /**
   * Creates an object literal expression.
   * @param props A map of key-value pairs where values are AST Expressions.
   * @example { keepDiscriminatorProperty: true }
   */
  public createObjectLiteral(props: Record<string, ts.Expression>): ts.ObjectLiteralExpression {
    const properties = Object.entries(props).map(([key, value]) =>
      ts.factory.createPropertyAssignment(key, value),
    );
    // `multiLine: true` so large objects render across multiple lines.
    return ts.factory.createObjectLiteralExpression(properties, true);
  }

  /**
   * Creates an array literal expression.
   * @param elements Array of AST Expressions.
   * @example [elem1, elem2]
   */
  public createArrayLiteral(elements: ts.Expression[]): ts.ArrayLiteralExpression {
    return ts.factory.createArrayLiteralExpression(elements, false);
  }

  /** Creates a boolean literal (true or false) */
  public createBooleanLiteral(value: boolean): ts.BooleanLiteral {
    return value ? ts.factory.createTrue() : ts.factory.createFalse();
  }

  /** Creates a string literal ("text") */
  public createStringLiteral(text: string): ts.StringLiteral {
    return ts.factory.createStringLiteral(text);
  }

  /** Creates an identifier (e.g., a class name reference like GuardDogTraits) */
  public createIdentifier(name: string): ts.Identifier {
    return ts.factory.createIdentifier(name);
  }
}
