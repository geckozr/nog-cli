import ts from 'typescript';

/**
 * Utility class for building TypeScript import declarations.
 * Designed to be injected via DI.
 */
export class ImportBuilder {
  /**
   * Creates a named import declaration.
   * @example
   * createNamedImport('class-validator', ['IsString', 'IsOptional'])
   * // Generates: import { IsString, IsOptional } from "class-validator";
   *
   * @param moduleSpecifier The path or module name to import from (e.g., 'class-validator').
   * @param names The list of named exports to import.
   * @returns The generated ImportDeclaration AST node.
   */
  public createNamedImport(moduleSpecifier: string, names: string[]): ts.ImportDeclaration {
    if (!names || names.length === 0) {
      throw new Error(
        `Cannot create an import declaration for module '${moduleSpecifier}' without named imports.`,
      );
    }

    const importSpecifiers = names.map((name) =>
      ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(name)),
    );

    const namedImports = ts.factory.createNamedImports(importSpecifiers);

    const importClause = ts.factory.createImportClause(undefined, undefined, namedImports);

    return ts.factory.createImportDeclaration(
      undefined,
      importClause,
      ts.factory.createStringLiteral(moduleSpecifier),
      undefined,
    );
  }
}
