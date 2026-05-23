import ts from 'typescript';

import { CommentModifier } from './comment-modifier';

export interface InlineParameterDef {
  name: string;
  isOptional: boolean;
  typeNode: ts.TypeNode;
  description?: string;
}

/**
 * Utility class for building TypeScript method parameters.
 * Designed to be injected via DI.
 */
export class ParameterBuilder {
  constructor(private readonly commentModifier: CommentModifier) {}

  /**
   * Builds a standard method parameter.
   * @example body: UserDto
   */
  public buildRegular(
    name: string,
    typeNode: ts.TypeNode,
    isOptional: boolean = false,
  ): ts.ParameterDeclaration {
    return ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(name),
      isOptional ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
      typeNode,
      undefined,
    );
  }

  /**
   * Builds an inline object parameter with JSDoc comments for each property.
   * Handles properties with special characters (like HTTP headers) using string literals.
   * @example params?: { apiKey: string; 'X-Custom-Header'?: string; }
   */
  public buildInlineObject(
    name: string,
    properties: InlineParameterDef[],
    isOptional: boolean = true,
  ): ts.ParameterDeclaration {
    // TODO: Evaluate if headers should be strictly separated from query params in the method signature.
    const propertySignatures = properties.map((prop) => {
      // Use string literal for names with dashes or invalid identifier characters (e.g., 'X-API-Key')
      const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(prop.name);
      const nameNode = isValidIdentifier
        ? ts.factory.createIdentifier(prop.name)
        : ts.factory.createStringLiteral(prop.name);

      const signature = ts.factory.createPropertySignature(
        undefined,
        nameNode,
        prop.isOptional ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
        prop.typeNode,
      );

      return this.commentModifier.addJSDoc(signature, prop.description);
    });

    const typeLiteral = ts.factory.createTypeLiteralNode(propertySignatures);

    return ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(name),
      isOptional ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
      typeLiteral,
      undefined,
    );
  }
}
