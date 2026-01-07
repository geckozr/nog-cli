import { SourceFile } from 'ts-morph';

import packageJson from '../../../../package.json';

/**
 * Helper class to manage standard file headers for generated code.
 *
 * Embeds linting disable directives and generation metadata (CLI version, OpenAPI spec info)
 * to identify generated artifacts and suppress linter warnings on synthesized code.
 */
export class FileHeaderHelper {
  /**
   * Generates the standard header string for all emitted files.
   *
   * Includes:
   * - Linter disable comments (`tslint`, `eslint`) to suppress false positives on generated code.
   * - Signature line with CLI version and OpenAPI spec metadata for traceability.
   *
   * @param specTitle - The title from the OpenAPI specification's `info.title` field.
   * @param specVersion - The version from the OpenAPI specification's `info.version` field.
   * @returns The header string to prepend to generated source files.
   */
  static getHeader(
    specTitle: string = 'Unknown Spec',
    specVersion: string = 'Unknown Version',
  ): string {
    return `/* tslint:disable */
/* eslint-disable */
// generated with nog-cli v${packageJson.version} - spec: ${specTitle} v${specVersion}
`;
  }

  /**
   * Inserts the generated file header at the beginning of a source file.
   *
   * Must be called after all other modifications and before `formatText()` to preserve header position.
   *
   * @param sourceFile - The ts-morph SourceFile instance to modify.
   * @param specTitle - The OpenAPI specification title.
   * @param specVersion - The OpenAPI specification version.
   */
  static addHeader(
    sourceFile: SourceFile,
    specTitle: string = 'Unknown Spec',
    specVersion: string = 'Unknown Version',
  ): void {
    sourceFile.insertText(0, this.getHeader(specTitle, specVersion));
  }
}
