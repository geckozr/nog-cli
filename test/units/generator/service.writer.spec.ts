import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { CommentModifier } from '../../../src/core/generator/writers/core/comment-modifier';
import { DecoratorBuilder } from '../../../src/core/generator/writers/core/decorator-builder';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../../src/core/generator/writers/core/import-builder';
import { ParameterBuilder } from '../../../src/core/generator/writers/core/parameter-builder';
import { ServiceMethodBuilder } from '../../../src/core/generator/writers/core/service-method-builder';
import { ServiceStatementBuilder } from '../../../src/core/generator/writers/core/service-statement-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';
import { ServiceWriter } from '../../../src/core/generator/writers/service.writer';
import { IrModel, IrService, IrType } from '../../../src/core/ir';

describe('ServiceWriter', () => {
  let writer: ServiceWriter;

  beforeEach(() => {
    const printer = new AstPrinter();
    const headerGenerator = new HeaderGenerator();
    const importBuilder = new ImportBuilder();
    const typeBuilder = new TypeBuilder();
    const decoratorBuilder = new DecoratorBuilder();
    const commentModifier = new CommentModifier();
    const parameterBuilder = new ParameterBuilder(commentModifier);
    const methodBuilder = new ServiceMethodBuilder(commentModifier);
    const statementBuilder = new ServiceStatementBuilder();

    writer = new ServiceWriter(
      printer,
      headerGenerator,
      importBuilder,
      typeBuilder,
      decoratorBuilder,
      parameterBuilder,
      methodBuilder,
      statementBuilder,
    );
  });

  const makeModels = (...names: { name: string; isEnum?: boolean }[]): IrModel[] =>
    names.map((m) => ({
      name: m.name,
      fileName: m.name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase(),
      isEnum: m.isEnum ?? false,
      properties: [],
      extends: undefined,
      description: undefined,
    }));

  it('should generate a complete service class with dual methods', async () => {
    const mockService: IrService = {
      name: 'GeocodingAPIService',
      operations: new Map([
        [
          'geocodeSearch',
          {
            methodName: 'geocodeSearch',
            operationId: 'geocodeSearch',
            path: '/v1/geocode/search',
            method: 'GET',
            description: 'The Forward Geocoding API allows you to search.',
            acceptHeader: 'application/json',
            returnType: { rawType: 'GeocodingJsonResponse', isPrimitive: false, isArray: false },
            parameters: [
              {
                name: 'text',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'query',
                isRequired: false,
                description: 'A free-form text string',
              },
            ],
          },
        ],
      ]),
    };

    const allModels = makeModels({ name: 'GeocodingJsonResponse' });
    const output = await writer.write(mockService, allModels, '1.0.0', 'Geocoding API', '1.0.0');

    expect(output.generatedCode).toContain("import { Injectable } from '@nestjs/common';");
    expect(output.generatedCode).toContain("import { HttpService } from '@nestjs/axios';");
    expect(output.generatedCode).toContain("import { Observable, firstValueFrom } from 'rxjs';");
    expect(output.generatedCode).toContain(
      "import { GeocodingJsonResponse } from '../dto/geocoding-json-response.dto';",
    );
    expect(output.generatedCode).toContain('@Injectable()');
    expect(output.generatedCode).toContain('export class GeocodingAPIService {');
    expect(output.generatedCode).toMatch(
      /constructor(\s*)?\(\s*private readonly httpService: HttpService,(\s*)?private readonly config: ApiConfiguration(,)?\s*\)\s*{}/,
    );

    // Method signatures
    expect(output.generatedCode).toContain('public geocodeSearch$(params?: {');
    expect(output.generatedCode).toContain('text?: string;');
    expect(output.generatedCode).toContain(
      '}): Observable<AxiosResponse<GeocodingJsonResponse>> {',
    );

    // Observable method body: query param extraction
    expect(output.generatedCode).toContain('const queryParams: Record<string, any> = {};');
    expect(output.generatedCode).toContain("queryParams['text'] = params.text");

    // Observable method body: headers setup
    expect(output.generatedCode).toContain('const headers: Record<string, string>');
    expect(output.generatedCode).toContain("headers['Accept'] = 'application/json'");

    // Observable method body: HTTP call with generic type
    expect(output.generatedCode).toContain(
      'return this.httpService.get<GeocodingJsonResponse>(url,',
    );
    expect(output.generatedCode).toContain('params: queryParams');

    // Promise method
    expect(output.generatedCode).toContain('public geocodeSearch(params?: {');
    expect(output.generatedCode).toContain('}): Promise<GeocodingJsonResponse> {');
    expect(output.generatedCode).toContain(
      '(res: AxiosResponse<GeocodingJsonResponse>) => res.data',
    );
  });

  it('should generate a POST service with path params, body params, multipart/form-data, and array return type', async () => {
    const mockService: IrService = {
      name: 'FileService',
      operations: new Map([
        [
          'uploadUserFile',
          {
            methodName: 'uploadUserFile',
            operationId: 'uploadUserFile',
            path: '/users/{userId}/files',
            method: 'POST',
            description: 'Upload a file for a user',
            acceptHeader: 'application/json',
            requestContentType: 'multipart/form-data',
            parameters: [
              {
                name: 'userId',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'path',
                isRequired: true,
              },
              {
                name: 'file',
                type: { rawType: 'UploadRequest', isPrimitive: false, isArray: false },
                in: 'body',
                isRequired: true,
              },
            ],
            returnType: { rawType: 'FileMetaDto', isPrimitive: false, isArray: true },
          },
        ],
        [
          'importFile',
          {
            methodName: 'importFile',
            operationId: 'importFile',
            path: '/imports/{kind}',
            method: 'POST',
            requestContentType: 'multipart/form-data',
            parameters: [
              {
                name: 'kind',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'path',
                isRequired: true,
              },
              {
                name: 'body',
                type: {
                  rawType: '{ params?: ImportedFileNew; file?: Buffer | ReadStream }',
                  isPrimitive: false,
                  isArray: false,
                  referencedTypes: ['ImportedFileNew'],
                },
                in: 'body',
                isRequired: false,
              },
            ],
            returnType: { rawType: 'string', isPrimitive: true, isArray: false },
          },
        ],
      ]),
    };

    const allModels = makeModels(
      { name: 'UploadRequest' },
      { name: 'FileMetaDto' },
      { name: 'ImportedFileNew' },
    );
    const output = await writer.write(mockService, allModels, '1.0.0', 'File API', '2.0.0');

    expect(output.generatedCode).toContain("import { toFormData } from '../api.utils';");
    expect(output.generatedCode).toContain(
      "import { FileMetaDto } from '../dto/file-meta-dto.dto';",
    );
    expect(output.generatedCode).toContain(
      "import { UploadRequest } from '../dto/upload-request.dto';",
    );
    expect(output.generatedCode).toContain('export class FileService {');
    expect(output.generatedCode).toContain('userId: string');
    expect(output.generatedCode).toContain('file: UploadRequest');
    expect(output.generatedCode).toContain('Observable<AxiosResponse<FileMetaDto[]>>');
    expect(output.generatedCode).toContain('Promise<FileMetaDto[]>');

    // multipart/form-data: body wrapped with toFormData
    expect(output.generatedCode).toContain('file ? toFormData(file) : undefined');

    // multipart/form-data Content-Type should NOT be emitted
    expect(output.generatedCode).not.toContain("'Content-Type'");

    // Promise method
    expect(output.generatedCode).toContain('(res: AxiosResponse<FileMetaDto[]>) => res.data');

    // referencedTypes: DTO inside inline object body should be imported
    expect(output.generatedCode).toContain(
      "import { ImportedFileNew } from '../dto/imported-file-new.dto';",
    );

    // ReadStream detected in parameter rawType → import from 'fs'
    expect(output.generatedCode).toContain("import { ReadStream } from 'fs';");

    // Buffer is a Node.js global, should NOT be imported
    expect(output.generatedCode).not.toMatch(/import.*\bBuffer\b/);
  });

  it('should generate a service where header params are extracted into headers, not query params, and handle responseType', async () => {
    const mockService: IrService = {
      name: 'AuthenticatedService',
      operations: new Map([
        [
          'getSecureResource',
          {
            methodName: 'getSecureResource',
            operationId: 'getSecureResource',
            path: '/secure',
            method: 'GET',
            acceptHeader: 'application/octet-stream',
            responseType: 'blob',
            parameters: [
              {
                name: 'authorization',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'header',
                isRequired: true,
              },
              {
                name: 'format',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'query',
                isRequired: false,
              },
            ],
            returnType: {
              rawType: ['SecureResourceDto', 'ErrorDto'],
              isPrimitive: false,
              isArray: false,
              composition: 'union' as const,
            },
          },
        ],
      ]),
    };

    const allModels = makeModels({ name: 'SecureResourceDto' }, { name: 'ErrorDto' });
    const output = await writer.write(mockService, allModels, '1.0.0', 'Secure API', '1.0.0');

    expect(output.generatedCode).toContain('export class AuthenticatedService {');
    expect(output.generatedCode).toContain(
      "import { SecureResourceDto } from '../dto/secure-resource-dto.dto';",
    );
    expect(output.generatedCode).toContain('authorization: string;');
    expect(output.generatedCode).toContain('public getSecureResource$(params?: {');
    expect(output.generatedCode).toContain('public getSecureResource(params?: {');

    // Mixed query + header: both should be in the same params object
    // Query param should be extracted to queryParams
    expect(output.generatedCode).toContain('const queryParams');
    expect(output.generatedCode).toContain("queryParams['format'] = params.format");
    // Header params should be extracted into headers
    expect(output.generatedCode).toContain(
      "headers['authorization'] = String(params['authorization'])",
    );

    // responseType and acceptHeader
    expect(output.generatedCode).toContain("responseType: 'blob'");
    expect(output.generatedCode).toContain("headers['Accept'] = 'application/octet-stream'");

    // Union return type: all types imported and combined with |
    expect(output.generatedCode).toContain("import { ErrorDto } from '../dto/error-dto.dto';");
    expect(output.generatedCode).toContain('SecureResourceDto | ErrorDto');
  });

  it('should generate a service with only primitive types and fall back to any when returnType is undefined', async () => {
    const mockService: IrService = {
      name: 'HealthService',
      operations: new Map([
        [
          'ping',
          {
            methodName: 'ping',
            operationId: 'ping',
            path: '/ping',
            method: 'GET',
            parameters: [],
            returnType: undefined as unknown as IrType,
          },
        ],
      ]),
    };

    const output = await writer.write(mockService, [], '1.0.0', 'Health API', '1.0.0');

    expect(output.generatedCode).not.toMatch(/from '\.\.\/dto\//);
    expect(output.generatedCode).toContain('export class HealthService {');
    expect(output.generatedCode).toContain('Observable<AxiosResponse<any>>');
    expect(output.generatedCode).toContain('Promise<any>');
    expect(output.generatedCode).toContain('(res: AxiosResponse<any>) => res.data');
  });

  it('should use .enum extension for enum types and order params: required body, path, optional body, query', async () => {
    const mockService: IrService = {
      name: 'ImportService',
      operations: new Map([
        [
          'listFiles',
          {
            methodName: 'listFiles',
            operationId: 'listFiles',
            path: '/files/{userId}',
            method: 'POST',
            acceptHeader: 'application/json',
            parameters: [
              {
                name: 'userId',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'path',
                isRequired: true,
              },
              {
                name: 'body',
                type: { rawType: 'FileRequest', isPrimitive: false, isArray: false },
                in: 'body',
                isRequired: true,
              },
              {
                name: 'metadata',
                type: { rawType: 'FileMetadata', isPrimitive: false, isArray: false },
                in: 'body',
                isRequired: false,
              },
              {
                name: 'status',
                type: { rawType: 'FileStatusEnum', isPrimitive: false, isArray: false },
                in: 'query',
                isRequired: false,
              },
            ],
            returnType: { rawType: 'FileResult', isPrimitive: false, isArray: true },
          },
        ],
      ]),
    };

    const allModels = makeModels(
      { name: 'FileStatusEnum', isEnum: true },
      { name: 'FileResult' },
      { name: 'FileRequest' },
      { name: 'FileMetadata' },
    );
    const output = await writer.write(mockService, allModels, '1.0.0', 'File API', '1.0.0');

    // Enum should use .enum extension
    expect(output.generatedCode).toContain(
      "import { FileStatusEnum } from '../dto/file-status-enum.enum';",
    );
    // Non-enum should use .dto extension
    expect(output.generatedCode).toContain("import { FileResult } from '../dto/file-result.dto';");

    // Parameter ordering: required body → path → optional body → params object
    const methodSignature =
      output.generatedCode.match(/public listFiles\$\(([\s\S]*?)\):/)?.[1] || '';
    const bodyIdx = methodSignature.indexOf('body: FileRequest');
    const userIdIdx = methodSignature.indexOf('userId: string');
    const metadataIdx = methodSignature.indexOf('metadata?: FileMetadata');
    const paramsIdx = methodSignature.indexOf('params?: {');

    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(userIdIdx).toBeGreaterThan(bodyIdx);
    expect(metadataIdx).toBeGreaterThan(userIdIdx);
    expect(paramsIdx).toBeGreaterThan(metadataIdx);
  });

  it('should handle application/x-www-form-urlencoded as form data', async () => {
    const mockService: IrService = {
      name: 'FormService',
      operations: new Map([
        [
          'submitForm',
          {
            methodName: 'submitForm',
            operationId: 'submitForm',
            path: '/form',
            method: 'POST',
            requestContentType: 'application/x-www-form-urlencoded',
            parameters: [
              {
                name: 'data',
                type: { rawType: 'FormDataDto', isPrimitive: false, isArray: false },
                in: 'body',
                isRequired: true,
              },
            ],
            returnType: { rawType: 'string', isPrimitive: true, isArray: false },
          },
        ],
      ]),
    };

    const allModels = makeModels({ name: 'FormDataDto' });
    const output = await writer.write(mockService, allModels, '1.0.0', 'Form API', '1.0.0');

    expect(output.generatedCode).toContain("import { toFormData } from '../api.utils';");
    expect(output.generatedCode).toContain('data ? toFormData(data) : undefined');
    // x-www-form-urlencoded DOES emit Content-Type (unlike multipart, where Axios sets boundary)
    expect(output.generatedCode).toContain(
      "headers['Content-Type'] = 'application/x-www-form-urlencoded'",
    );
  });

  it('should skip import for custom type not found in model registry', async () => {
    const mockService: IrService = {
      name: 'MissingModelService',
      operations: new Map([
        [
          'getData',
          {
            methodName: 'getData',
            operationId: 'getData',
            path: '/data',
            method: 'GET',
            parameters: [
              {
                name: 'filter',
                type: { rawType: 'UnknownType', isPrimitive: false, isArray: false },
                in: 'query',
                isRequired: false,
              },
            ],
            returnType: { rawType: 'string', isPrimitive: true, isArray: false },
          },
        ],
      ]),
    };

    const output = await writer.write(mockService, [], '1.0.0', 'Missing API', '1.0.0');

    // UnknownType is not in the model registry, so no DTO import should be generated
    expect(output.generatedCode).not.toMatch(/import.*UnknownType/);
  });
});
