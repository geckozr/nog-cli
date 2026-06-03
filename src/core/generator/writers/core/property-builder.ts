import ts from 'typescript';

import { CommentModifier } from './comment-modifier';

export interface PropertyBuilderOptions {
  decorators?: ts.Decorator[];
  isOptional?: boolean;
  isReadonly?: boolean;
  isRedeclared?: boolean;
  description?: string;
}

/**
 * Utility class for building TypeScript class properties.
 * Designed to be injected via DI.
 */
export class PropertyBuilder {
  constructor(private readonly commentModifier: CommentModifier) {}

  /**
   * Creates a class property declaration.
   * @example
   * // Generates:
   * // /** User's age *\/
   * // \@IsOptional() public readonly age?: number;
   *
   * @param name The name of the property.
   * @param typeNode The AST node representing the property's type.
   * @param options Modifiers, decorators, and comments for the property.
   * @returns The generated PropertyDeclaration AST node.
   */
  public create(
    name: string,
    typeNode: ts.TypeNode,
    options: PropertyBuilderOptions = {},
  ): ts.PropertyDeclaration {
    const modifiers: ts.ModifierLike[] = [];

    if (options.decorators && options.decorators.length > 0) {
      modifiers.push(...options.decorators);
    }

    if (options.isRedeclared) {
      modifiers.push(ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword));
    }

    modifiers.push(ts.factory.createModifier(ts.SyntaxKind.PublicKeyword));

    if (options.isReadonly) {
      modifiers.push(ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword));
    }

    const questionToken = options.isOptional
      ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
      : ts.factory.createToken(ts.SyntaxKind.ExclamationToken);

    const propertyNode = ts.factory.createPropertyDeclaration(
      modifiers,
      ts.factory.createIdentifier(name),
      questionToken,
      typeNode,
      undefined,
    );

    return this.commentModifier.addJSDoc(propertyNode, options.description);
  }
}
