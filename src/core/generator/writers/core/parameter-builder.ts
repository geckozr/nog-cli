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
    return ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(name),
      isOptional ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
      this.buildInlineObjectType(properties),
      undefined,
    );
  }

  /**
   * Builds a `params?: { query?: {...}; headers?: {...} }` parameter, omitting
   * the `query` or `headers` branches when their property list is empty.
   * Returns `null` when both branches are empty.
   *
   * Keeping query and headers in separate sub-objects (rather than one flat record)
   * lets the runtime `RequestBuilder` apply each set under its own OpenAPI rules
   * without having to disambiguate by name.
   */
  public buildSplitParams(
    name: string,
    queryProps: InlineParameterDef[],
    headerProps: InlineParameterDef[],
    isOptional: boolean = true,
  ): ts.ParameterDeclaration | null {
    if (queryProps.length === 0 && headerProps.length === 0) return null;

    const branches: ts.PropertySignature[] = [];
    if (queryProps.length > 0) {
      branches.push(
        ts.factory.createPropertySignature(
          undefined,
          ts.factory.createIdentifier('query'),
          ts.factory.createToken(ts.SyntaxKind.QuestionToken),
          this.buildInlineObjectType(queryProps),
        ),
      );
    }
    if (headerProps.length > 0) {
      branches.push(
        ts.factory.createPropertySignature(
          undefined,
          ts.factory.createIdentifier('headers'),
          ts.factory.createToken(ts.SyntaxKind.QuestionToken),
          this.buildInlineObjectType(headerProps),
        ),
      );
    }

    return ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(name),
      isOptional ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
      ts.factory.createTypeLiteralNode(branches),
      undefined,
    );
  }

  private buildInlineObjectType(properties: InlineParameterDef[]): ts.TypeLiteralNode {
    const propertySignatures = properties.map((prop) => {
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

    return ts.factory.createTypeLiteralNode(propertySignatures);
  }
}
