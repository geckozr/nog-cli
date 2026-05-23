import ts from 'typescript';

import { CommentModifier } from './comment-modifier';

/**
 * Utility class for building TypeScript class methods for Services.
 * Designed to be injected via DI.
 */
export class ServiceMethodBuilder {
  constructor(private readonly commentModifier: CommentModifier) {}

  /**
   * Builds a public method declaration.
   *
   * @param name The name of the method.
   * @param parameters The array of parameter declarations.
   * @param returnType The return type node (e.g. Observable<MyDto>).
   * @param body The block of code inside the method.
   * @param description Optional JSDoc description.
   * @returns The MethodDeclaration AST node.
   */
  public build(
    name: string,
    parameters: ts.ParameterDeclaration[],
    returnType: ts.TypeNode,
    body: ts.Block,
    description?: string,
  ): ts.MethodDeclaration {
    const methodNode = ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword)],
      undefined,
      ts.factory.createIdentifier(name),
      undefined,
      undefined,
      parameters,
      returnType,
      body,
    );

    return this.commentModifier.addJSDoc(methodNode, description);
  }
}
