import path from 'path';
import { describe, expect, it } from 'vitest';

import { OpenApiParser } from '../../../src/core/parser';

describe('OpenApiParser', () => {
  describe('parse', () => {
    it('should parse a valid OpenAPI document', async () => {
      // Read from cataas.json fixture
      const exampleOpenApiDoc = path.join(__dirname, '../../fixtures/cataas.json');
      const parsedDocument = await OpenApiParser.parse(exampleOpenApiDoc);

      expect(parsedDocument).toBeDefined();
    });

    it('should throw an error for invalid OpenAPI document', async () => {
      const invalidOpenApiDoc = path.join(__dirname, '../../fixtures/invalid-openapi.json');

      await expect(OpenApiParser.parse(invalidOpenApiDoc)).rejects.toThrow('OpenAPI Parser Error');
    });

    it('should throw an error for unsupported OpenAPI version', async () => {
      const unsupportedVersionDoc = path.join(
        __dirname,
        '../../fixtures/unsupported-openapi-version.json',
      );

      await expect(OpenApiParser.parse(unsupportedVersionDoc)).rejects.toThrow(
        'Unsupported OpenAPI version',
      );
    });

    it('should throw an error for malformed JSON file', async () => {
      const malformedPath = path.join(__dirname, '../../fixtures/malformed.json');

      await expect(OpenApiParser.parse(malformedPath)).rejects.toThrow('OpenAPI Parser Error');
    });

    it('should catch and wrap parsing errors', async () => {
      const invalidPath = path.join(__dirname, '../../fixtures/non-existent-file.json');

      await expect(OpenApiParser.parse(invalidPath)).rejects.toThrow('OpenAPI Parser Error');
    });
  });
});
