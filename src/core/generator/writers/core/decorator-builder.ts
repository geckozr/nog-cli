import ts from 'typescript';

/**
 * Utility class for building TypeScript decorators.
 * Designed to be injected via DI.
 */
export class DecoratorBuilder {
  /**
   * Creates a decorator with optional arguments.
   *
   * @example
   * create('Injectable') // @Injectable()
   * create('Min', [ts.factory.createNumericLiteral(0)]) // @Min(0)
   *
   * @param name The name of the decorator (e.g., 'IsString', 'Type').
   * @param args An array of AST Expressions representing the arguments.
   * @returns The generated Decorator AST node.
   */
  public create(name: string, args: ts.Expression[] = []): ts.Decorator {
    return ts.factory.createDecorator(
      ts.factory.createCallExpression(
        ts.factory.createIdentifier(name),
        undefined, // typeArguments (e.g., <T>, rarely used in NestJS decorators)
        args, // The actual arguments inside the parentheses
      ),
    );
  }
}
