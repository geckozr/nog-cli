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

  it('generates a complete service class with dual methods and RequestBuilder DI', async () => {
    const mockService: IrService = {
      name: 'GeocodingAPIService',
      fileName: 'geocoding-api.service',
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
    expect(output.generatedCode).toContain(
      "import { RequestBuilder } from '../request-builder.service';",
    );
    expect(output.generatedCode).toContain("import { Observable, firstValueFrom } from 'rxjs';");
    expect(output.generatedCode).toContain(
      "import { GeocodingJsonResponse } from '../dto/geocoding-json-response.dto';",
    );
    expect(output.generatedCode).toContain('@Injectable()');
    expect(output.generatedCode).toContain('export class GeocodingAPIService {');
    expect(output.generatedCode).toMatch(
      /constructor\(\s*private readonly httpService: HttpService,\s*private readonly config: ApiConfiguration,\s*private readonly rb: RequestBuilder,?\s*\)\s*\{\}/,
    );

    // Method signature: nested params with a `query` branch
    expect(output.generatedCode).toContain('public geocodeSearch$(');
    expect(output.generatedCode).toContain('params?: {');
    expect(output.generatedCode).toContain('query?: {');
    expect(output.generatedCode).toContain('text?: string;');
    expect(output.generatedCode).toMatch(/\): Observable<AxiosResponse<GeocodingJsonResponse>>/);

    // URL construction via rb.buildUrl
    expect(output.generatedCode).toContain('this.rb.buildUrl(');
    expect(output.generatedCode).toContain("'/v1/geocode/search'");

    // Query extraction via rb.buildQuery on the query sub-object
    expect(output.generatedCode).toContain('this.rb.buildQuery(');
    expect(output.generatedCode).toContain('params?.query');
    expect(output.generatedCode).toContain("'text'");

    // Headers setup: plain spread (no header params in this op) + Accept assignment
    expect(output.generatedCode).toContain('const headers: Record<string, string>');
    expect(output.generatedCode).toContain("headers['Accept'] = 'application/json'");

    // HTTP call with generic type
    expect(output.generatedCode).toContain(
      'return this.httpService.get<GeocodingJsonResponse>(url,',
    );
    expect(output.generatedCode).toContain('params: queryParams');

    // Promise method
    expect(output.generatedCode).toContain('public geocodeSearch(');
    expect(output.generatedCode).toMatch(/\): Promise<GeocodingJsonResponse>/);
    expect(output.generatedCode).toContain(
      '(res: AxiosResponse<GeocodingJsonResponse>) => res.data',
    );
  });

  it('generates a POST service with path params, body params, multipart/form-data, and array return type', async () => {
    const mockService: IrService = {
      name: 'FileService',
      fileName: 'file.service',
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

    expect(output.generatedCode).toContain("'/users/{userId}/files'");
    expect(output.generatedCode).toMatch(/\{\s*userId,?\s*\}/);

    // multipart: header set + body passed raw (axios auto-serializes)
    expect(output.generatedCode).toContain("headers['Content-Type'] = 'multipart/form-data'");
    expect(output.generatedCode).toMatch(
      /this\.httpService\.post<FileMetaDto\[\]>\(\s*url,\s*file,/,
    );

    // Promise method
    expect(output.generatedCode).toContain('(res: AxiosResponse<FileMetaDto[]>) => res.data');

    // referencedTypes: DTO inside inline object body should be imported
    expect(output.generatedCode).toContain(
      "import { ImportedFileNew } from '../dto/imported-file-new.dto';",
    );

    expect(output.generatedCode).toContain("import { ReadStream } from 'fs';");
  });

  it('extracts header params via rb.buildHeaders and keeps query params on the query sub-object', async () => {
    const mockService: IrService = {
      name: 'AuthenticatedService',
      fileName: 'authenticated.service',
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
    expect(output.generatedCode).toContain('format?: string;');
    expect(output.generatedCode).toContain('public getSecureResource$(');
    expect(output.generatedCode).toContain('query?: {');
    expect(output.generatedCode).toContain('headers?: {');

    // Query goes through rb.buildQuery with the query branch as source
    expect(output.generatedCode).toContain('this.rb.buildQuery(');
    expect(output.generatedCode).toContain('params?.query');
    expect(output.generatedCode).toContain("'format'");

    // Header goes through rb.buildHeaders with the headers branch as extras
    expect(output.generatedCode).toContain('this.rb.buildHeaders(');
    expect(output.generatedCode).toContain('this.config.headers');
    expect(output.generatedCode).toContain('params?.headers');
    expect(output.generatedCode).toContain("'authorization'");

    expect(output.generatedCode).toContain("responseType: 'blob'");
    expect(output.generatedCode).toContain("headers['Accept'] = 'application/octet-stream'");

    expect(output.generatedCode).toContain("import { ErrorDto } from '../dto/error-dto.dto';");
    expect(output.generatedCode).toContain('SecureResourceDto | ErrorDto');
  });

  it('emits an intersection return type when the operation returnType has composition: intersection', async () => {
    const mockService: IrService = {
      name: 'AuditService',
      fileName: 'audit.service',
      operations: new Map([
        [
          'getPostAuditTrail',
          {
            methodName: 'getPostAuditTrail',
            operationId: 'getPostAuditTrail',
            path: '/posts/{id}/audit-trail',
            method: 'GET',
            acceptHeader: 'application/json',
            parameters: [
              {
                name: 'id',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'path',
                isRequired: true,
              },
            ],
            returnType: {
              rawType: ['Post', 'AuditInfo'],
              isPrimitive: false,
              isArray: false,
              composition: 'intersection' as const,
            },
          },
        ],
      ]),
    };

    const allModels = makeModels({ name: 'Post' }, { name: 'AuditInfo' });
    const output = await writer.write(mockService, allModels, '1.0.0', 'Audit API', '1.0.0');

    expect(output.generatedCode).toContain('export class AuditService {');
    expect(output.generatedCode).toContain("import { Post } from '../dto/post.dto';");
    expect(output.generatedCode).toContain("import { AuditInfo } from '../dto/audit-info.dto';");
    expect(output.generatedCode).toContain('Observable<AxiosResponse<Post & AuditInfo>>');
    expect(output.generatedCode).toContain('Promise<Post & AuditInfo>');
  });

  it('keeps query and header params strictly in their own sub-branches (sentinel against routing regression)', async () => {
    const mockService: IrService = {
      name: 'VoucherInfoService',
      fileName: 'voucher-info.service',
      operations: new Map([
        [
          'verifyVoucher',
          {
            methodName: 'verifyVoucher',
            operationId: 'verifyVoucher',
            path: '/voucher-info/{token}',
            method: 'GET',
            parameters: [
              {
                name: 'token',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'path',
                isRequired: true,
              },
              {
                name: 'fields',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'query',
                isRequired: false,
              },
              {
                name: 'pin',
                type: { rawType: 'string', isPrimitive: true, isArray: false },
                in: 'header',
                isRequired: false,
              },
            ],
            returnType: { rawType: 'string', isPrimitive: true, isArray: false },
          },
        ],
      ]),
    };

    const output = await writer.write(mockService, makeModels(), '1.0.0', 'Voucher API', '1.0.0');

    // The query whitelist passed to rb.buildQuery contains 'fields' only (never 'pin')
    expect(output.generatedCode).toMatch(
      /this\.rb\.buildQuery\([\s\S]*?'fields'[\s\S]*?\] as const,?\s*\)/,
    );

    // The header whitelist passed to rb.buildHeaders contains 'pin' only (never 'fields')
    expect(output.generatedCode).toMatch(
      /this\.rb\.buildHeaders\([\s\S]*?'pin'[\s\S]*?\] as const,?\s*\)/,
    );

    // Path is positional, no longer a body of a template literal
    expect(output.generatedCode).toContain('token: string,');
    expect(output.generatedCode).toContain("'/voucher-info/{token}'");
    expect(output.generatedCode).toMatch(/\{\s*token,?\s*\}/);
  });

  it('emits the rb.buildQuery styles map for non-default OpenAPI style+explode combinations', async () => {
    const mockService: IrService = {
      name: 'SearchService',
      fileName: 'search.service',
      operations: new Map([
        [
          'searchItems',
          {
            methodName: 'searchItems',
            operationId: 'searchItems',
            path: '/search',
            method: 'GET',
            parameters: [
              {
                name: 'ids',
                type: { rawType: 'string', isPrimitive: true, isArray: true },
                in: 'query',
                isRequired: false,
                style: 'form',
                explode: false,
              },
              {
                name: 'tags',
                type: { rawType: 'string', isPrimitive: true, isArray: true },
                in: 'query',
                isRequired: false,
                style: 'pipeDelimited',
              },
              {
                name: 'coords',
                type: { rawType: 'number', isPrimitive: true, isArray: true },
                in: 'query',
                isRequired: false,
                style: 'spaceDelimited',
              },
              {
                name: 'filter',
                type: { rawType: 'any', isPrimitive: true, isArray: false },
                in: 'query',
                isRequired: false,
                style: 'deepObject',
              },
              {
                name: 'limit',
                type: { rawType: 'number', isPrimitive: true, isArray: false },
                in: 'query',
                isRequired: false,
              },
            ],
            returnType: { rawType: 'string', isPrimitive: true, isArray: true },
          },
        ],
      ]),
    };

    const output = await writer.write(mockService, makeModels(), '1.0.0', 'Search API', '1.0.0');

    expect(output.generatedCode).toContain('this.rb.buildQuery(');
    expect(output.generatedCode).toContain("ids: 'csv'");
    expect(output.generatedCode).toContain("tags: 'pipe'");
    expect(output.generatedCode).toContain("coords: 'space'");
    expect(output.generatedCode).toContain("filter: 'deep'");
  });

  it('falls back to any when returnType is undefined and emits no params object for path-less operations', async () => {
    const mockService: IrService = {
      name: 'HealthService',
      fileName: 'health.service',
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

    expect(output.generatedCode).toContain('export class HealthService {');
    expect(output.generatedCode).toContain('Observable<AxiosResponse<any>>');
    expect(output.generatedCode).toContain('Promise<any>');
    expect(output.generatedCode).toContain('(res: AxiosResponse<any>) => res.data');

    expect(output.generatedCode).toContain("this.rb.buildUrl('/ping')");
  });

  it('uses .enum extension for enum types and orders params: required body → path → optional body → params', async () => {
    const mockService: IrService = {
      name: 'ImportService',
      fileName: 'import.service',
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

    expect(output.generatedCode).toContain(
      "import { FileStatusEnum } from '../dto/file-status-enum.enum';",
    );
    expect(output.generatedCode).toContain("import { FileResult } from '../dto/file-result.dto';");

    const methodSignature =
      output.generatedCode.match(/public listFiles\$\(([\s\S]*?)\): Observable/)?.[1] ?? '';
    const bodyIdx = methodSignature.indexOf('body: FileRequest');
    const userIdIdx = methodSignature.indexOf('userId: string');
    const metadataIdx = methodSignature.indexOf('metadata?: FileMetadata');
    const paramsIdx = methodSignature.indexOf('params?: {');

    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(userIdIdx).toBeGreaterThan(bodyIdx);
    expect(metadataIdx).toBeGreaterThan(userIdIdx);
    expect(paramsIdx).toBeGreaterThan(metadataIdx);
  });

  it('handles application/x-www-form-urlencoded as form data', async () => {
    const mockService: IrService = {
      name: 'FormService',
      fileName: 'form.service',
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

    expect(output.generatedCode).toContain('return this.httpService.post<string>(url, data, {');
    expect(output.generatedCode).toContain(
      "headers['Content-Type'] = 'application/x-www-form-urlencoded'",
    );
  });

  it('skips import for a custom type not found in the model registry', async () => {
    const mockService: IrService = {
      name: 'MissingModelService',
      fileName: 'missing-model.service',
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

    expect(output.generatedCode).toContain('export class MissingModelService {');
    expect(output.generatedCode).toContain('filter?: UnknownType');
  });

  it('emits string-literal union for anonymous string enums (no fallback to any)', async () => {
    const mockService: IrService = {
      name: 'CatsService',
      fileName: 'cats.service',
      operations: new Map([
        [
          'getCat',
          {
            methodName: 'getCat',
            operationId: 'getCat',
            path: '/cat',
            method: 'GET',
            parameters: [
              {
                name: 'type',
                type: {
                  rawType: ['square', 'medium', 'small', 'xsmall'],
                  isPrimitive: true,
                  isArray: false,
                  composition: 'union' as const,
                },
                in: 'query',
                isRequired: false,
              },
            ],
            returnType: { rawType: 'string', isPrimitive: true, isArray: false },
          },
        ],
      ]),
    };

    const output = await writer.write(mockService, [], '1.0.0', 'Cataas', '1.0.0');

    expect(output.generatedCode).toContain("type?: 'square' | 'medium' | 'small' | 'xsmall'");
  });

  it('emits inline TS type literal for object-with-properties response (no fallback to any)', async () => {
    const mockService: IrService = {
      name: 'CountService',
      fileName: 'count.service',
      operations: new Map([
        [
          'apiCount',
          {
            methodName: 'apiCount',
            operationId: 'apiCount',
            path: '/api/count',
            method: 'GET',
            parameters: [],
            returnType: {
              rawType: '{ count?: number }',
              isPrimitive: false,
              isArray: false,
            },
          },
        ],
      ]),
    };

    const output = await writer.write(mockService, [], '1.0.0', 'Cataas', '1.0.0');

    expect(output.generatedCode).toContain('Observable<AxiosResponse<{ count?: number }>>');
    expect(output.generatedCode).toContain('Promise<{ count?: number }>');
  });
});
