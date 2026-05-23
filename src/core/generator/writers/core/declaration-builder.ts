import ts from 'typescript';

/**
 * Utility class for building TypeScript declarations (Interfaces, Type Aliases, Variables).
 * Designed to be injected via DI.
 */
export class DeclarationBuilder {
  /**
   * Creates an exported or internal Type Alias.
   * @example export type ApiHeaders = Record<string, string>;
   */
  public createTypeAlias(
    name: string,
    type: ts.TypeNode,
    isExported = true,
  ): ts.TypeAliasDeclaration {
    const modifiers = isExported
      ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
      : undefined;
    return ts.factory.createTypeAliasDeclaration(
      modifiers,
      ts.factory.createIdentifier(name),
      undefined,
      type,
    );
  }

  /**
   * Creates an exported or internal Interface.
   * @param name The name of the interface.
   * @param members The properties and methods of the interface.
   * @param extendsTypes Optional array of expressions for the 'extends' clause.
   * @param isExported Whether to add the 'export' modifier.
   */
  public createInterface(
    name: string,
    members: ts.TypeElement[],
    extendsTypes?: ts.ExpressionWithTypeArguments[],
    isExported = true,
  ): ts.InterfaceDeclaration {
    const modifiers = isExported
      ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
      : undefined;

    const heritageClauses =
      extendsTypes && extendsTypes.length > 0
        ? [ts.factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, extendsTypes)]
        : undefined;

    return ts.factory.createInterfaceDeclaration(
      modifiers,
      ts.factory.createIdentifier(name),
      undefined,
      heritageClauses,
      members,
    );
  }

  /**
   * Creates a Property Signature for an interface.
   * @example baseUrl?: string;
   */
  public createPropertySignature(
    name: string,
    type: ts.TypeNode,
    isOptional = false,
  ): ts.PropertySignature {
    const questionToken = isOptional
      ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
      : undefined;
    return ts.factory.createPropertySignature(
      undefined,
      ts.factory.createIdentifier(name),
      questionToken,
      type,
    );
  }

  /**
   * Creates a Method Signature for an interface.
   * @example createApiModuleConfig(): Promise<ApiModuleConfig>;
   */
  public createMethodSignature(
    name: string,
    parameters: ts.ParameterDeclaration[],
    returnType: ts.TypeNode,
  ): ts.MethodSignature {
    return ts.factory.createMethodSignature(
      undefined,
      ts.factory.createIdentifier(name),
      undefined,
      undefined,
      parameters,
      returnType,
    );
  }

  /**
   * Creates an exported constant variable statement.
   * @example export const API_CONFIG = Symbol("API_CONFIG");
   */
  public createConstVariable(
    name: string,
    initializer: ts.Expression,
    isExported = true,
  ): ts.VariableStatement {
    const modifiers = isExported
      ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
      : undefined;
    const declaration = ts.factory.createVariableDeclaration(
      ts.factory.createIdentifier(name),
      undefined,
      undefined,
      initializer,
    );
    const declarationList = ts.factory.createVariableDeclarationList(
      [declaration],
      ts.NodeFlags.Const,
    );
    return ts.factory.createVariableStatement(modifiers, declarationList);
  }

  /**
   * Helper to create an ExpressionWithTypeArguments, used in inheritance (extends).
   * @example Pick<ModuleMetadata, "imports">
   */
  public createExpressionWithTypeArguments(
    identifierName: string,
    typeArgs?: ts.TypeNode[],
  ): ts.ExpressionWithTypeArguments {
    return ts.factory.createExpressionWithTypeArguments(
      ts.factory.createIdentifier(identifierName),
      typeArgs,
    );
  }

  /**
   * Creates a Function Type Node.
   * @example (...args: unknown[]) => Promise<ApiModuleConfig>
   */
  public createFunctionTypeNode(
    parameters: ts.ParameterDeclaration[],
    returnType: ts.TypeNode,
  ): ts.FunctionTypeNode {
    return ts.factory.createFunctionTypeNode(undefined, parameters, returnType);
  }
}
