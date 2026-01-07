import $RefParser from '@apidevtools/json-schema-ref-parser';

import { OpenAPI, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';

import { Logger } from '../../utils';

/**
 * Union type representing supported OpenAPI document versions (v3.0 and v3.1).
 */
export type OpenApiDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;

/**
 * Core Parser for OpenAPI specifications.
 *
 * It handles the loading, parsing, and validation of OpenAPI JSON or YAML files.
 * It uses `@apidevtools/json-schema-ref-parser` to resolve external references.
 */
export class OpenApiParser {
  /**
   * Parses and validates an OpenAPI definition file.
   *
   * @param input - The file path or URL to the OpenAPI definition.
   * @returns A Promise that resolves to the parsed and validated OpenAPI document.
   * @throws {Error} If the file cannot be parsed or if the version is not supported.
   */
  static async parse(input: string): Promise<OpenApiDocument> {
    try {
      Logger.info('Parsing and validating OpenAPI definition...');

      // Using "bundle" to resolve external references while preserving internal $ref structure.
      // This keeps component identity intact for downstream generation (e.g., to maintain named models and avoid cycles)
      // and prevents over-eager dereferencing that could produce duplicated inline schemas.
      const api = (await $RefParser.bundle(input)) as OpenAPI.Document;

      this.ensureSupportedVersion(api);

      const validApi = api as OpenApiDocument;

      Logger.info(`Successfully parsed: ${validApi.info.title} (v${validApi.info.version})`);
      return validApi;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAPI Parser Error: ${message}`);
    }
  }

  private static ensureSupportedVersion(api: OpenAPI.Document): void {
    // Check if 'openapi' property exists (it distinguishes v3 from v2 which uses 'swagger')
    const version = 'openapi' in api ? api.openapi : undefined;

    if (!version || !version.startsWith('3.')) {
      throw new Error(
        `Unsupported OpenAPI version: ${version || 'Unknown'}. Only OpenAPI 3.0 and 3.1 are supported.`,
      );
    }
  }
}
