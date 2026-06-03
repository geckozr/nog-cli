import ts from 'typescript';

export type PrimitiveTypeName = 'string' | 'number' | 'boolean' | 'any' | 'void';

const PRIMITIVE_TYPE_NAMES = new Set<string>(['string', 'number', 'boolean', 'any', 'void']);

export function isPrimitiveTypeName(value: string): value is PrimitiveTypeName {
  return PRIMITIVE_TYPE_NAMES.has(value);
}

/**
 * Utility class for building TypeScript Type nodes.
 * Designed to be injected via DI.
 */
export class TypeBuilder {
  /**
   * Creates a primitive keyword type node (e.g., string, number, boolean).
   * @param type The string representation of the primitive.
   * @returns The generated KeywordTypeNode.
   */
  public createPrimitive(type: PrimitiveTypeName): ts.KeywordTypeNode {
    switch (type) {
      case 'string':
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      case 'number':
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
      case 'boolean':
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
      case 'void':
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword);
      case 'any':
      default:
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
    }
  }

  /**
   * Creates a reference to a custom type or class, optionally with generics.
   * @param typeName The name of the type to reference (e.g., UserDto, Observable).
   * @param typeArguments Optional type arguments for generics (e.g., the T in Observable<T>).
   * @returns The generated TypeReferenceNode.
   */
  public createReference(typeName: string, typeArguments?: ts.TypeNode[]): ts.TypeReferenceNode {
    return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier(typeName), typeArguments);
  }

  /**
   * Wraps an existing TypeNode into an ArrayTypeNode.
   * @param elementType The type node of the array elements.
   * @returns The generated ArrayTypeNode (e.g., string[]).
   */
  public createArray(elementType: ts.TypeNode): ts.ArrayTypeNode {
    return ts.factory.createArrayTypeNode(elementType);
  }

  /**
   * Creates a Union type from multiple type nodes (e.g., Cat | Dog).
   * A single-element input still yields a UnionTypeNode; the printer renders
   * it as the lone member.
   *
   * @param types An array of type nodes to unionize.
   * @returns The generated UnionTypeNode.
   * @throws If `types` is empty.
   */
  public createUnion(types: ts.TypeNode[]): ts.UnionTypeNode {
    if (types.length === 0) {
      throw new Error('Cannot create a union type without type nodes.');
    }
    return ts.factory.createUnionTypeNode(types);
  }

  /**
   * Creates a TypeScript string-literal type node, e.g. `'square'`. Used for
   * inline literal unions emitted from OpenAPI string enums declared without a title.
   *
   * @param value The string literal value.
   * @returns The generated LiteralTypeNode.
   */
  public createStringLiteral(value: string): ts.LiteralTypeNode {
    return ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(value));
  }

  /**
   * Creates an Intersection type from multiple type nodes (e.g., BaseEntity & Timestamped).
   * A single-element input still yields an IntersectionTypeNode; the printer
   * renders it as the lone member.
   *
   * @param types An array of type nodes to intersect.
   * @returns The generated IntersectionTypeNode.
   * @throws If `types` is empty.
   */
  public createIntersection(types: ts.TypeNode[]): ts.IntersectionTypeNode {
    if (types.length === 0) {
      throw new Error('Cannot create an intersection type without type nodes.');
    }
    return ts.factory.createIntersectionTypeNode(types);
  }
}
