import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportHelper } from '../../../src/core/generator/helpers/import.helper';
import { TypeHelper } from '../../../src/core/generator/helpers/type.helper';
import { ServiceWriter } from '../../../src/core/generator/writers/service.writer';
import { IrService } from '../../../src/core/ir/interfaces';

// Mock helpers
vi.mock('../../../src/core/generator/helpers/import.helper');
vi.mock('../../../src/core/generator/helpers/file-header.helper', () => ({
  FileHeaderHelper: {
    getHeader: () => '// Header',
    addHeader: vi.fn(),
  },
}));

// Mock TypeHelper factory
vi.mock('../../../src/core/generator/helpers/type.helper', () => ({
  TypeHelper: {
    getFileName: vi.fn(),
    irTypeToString: vi.fn(),
  },
}));

describe('ServiceWriter', () => {
  let projectMock: any;
  let sourceFileMock: any;
  let classMock: any;
  let methodMock: any;

  const outputDir = '/out';

  beforeEach(() => {
    // Setup Mocks
    methodMock = {
      setBodyText: vi.fn(),
    };
    classMock = {
      addConstructor: vi.fn(),
      addMethod: vi.fn().mockReturnValue(methodMock),
    };
    sourceFileMock = {
      addClass: vi.fn().mockReturnValue(classMock),
      formatText: vi.fn(),
    };
    projectMock = {
      createSourceFile: vi.fn().mockReturnValue(sourceFileMock),
    };

    vi.clearAllMocks();

    // Default Helper Mocks
    vi.mocked(TypeHelper.getFileName).mockImplementation((name) => name.toLowerCase());
    // Default: return 'string' unless overridden in specific tests
    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should write a basic service with http injection', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map(),
    };

    const writer = new ServiceWriter(projectMock, outputDir, []);
    await writer.writeAll([service]);

    // Check File Creation
    expect(projectMock.createSourceFile).toHaveBeenCalledWith(
      `${outputDir}/services/userservice.service.ts`,
      expect.any(String),
      { overwrite: true },
    );

    // Check Import Helper Call
    expect(ImportHelper.addServiceImports).toHaveBeenCalledWith(sourceFileMock, service, []);

    // Check Class & Decorator
    expect(sourceFileMock.addClass).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'UserService',
        decorators: [{ name: 'Injectable', arguments: [] }],
      }),
    );

    // Check Constructor Injection (should inject both HttpService and ApiConfiguration)
    expect(classMock.addConstructor).toHaveBeenCalledWith({
      parameters: [
        {
          name: 'httpService',
          type: 'HttpService',
          isReadonly: true,
          scope: 'private',
        },
        {
          name: 'config',
          type: 'ApiConfiguration',
          isReadonly: true,
          scope: 'private',
        },
      ],
    });
  });

  it('should generate Observable and Promise methods for GET operation with required path param', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'getUser',
          {
            methodName: 'getUser',
            operationId: 'getUser',
            method: 'GET',
            path: '/users/{id}',
            parameters: [
              { name: 'id', type: { rawType: 'string' }, isRequired: true, in: 'path' } as any,
            ],
            returnType: { rawType: 'UserDto' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockImplementation((t) => {
      return t.rawType === 'UserDto' ? 'UserDto' : 'string';
    });

    const writer = new ServiceWriter(projectMock, outputDir, []);
    await writer.writeAll([service]);

    // Check Observable Method Definition - required path param as separate argument
    expect(classMock.addMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'getUser$',
        returnType: 'Observable<AxiosResponse<UserDto>>',
        parameters: expect.arrayContaining([
          { name: 'id', type: 'string', hasQuestionToken: false },
        ]),
      }),
    );

    // Check Promise Method Definition - same signature
    expect(classMock.addMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'getUser',
        returnType: 'Promise<UserDto>',
        parameters: expect.arrayContaining([
          { name: 'id', type: 'string', hasQuestionToken: false },
        ]),
      }),
    );
  });

  it('should generate correct body for Promise method (wrapper)', async () => {
    const service: IrService = {
      name: 'TestService',
      operations: new Map([
        [
          'testOp',
          {
            methodName: 'testOp',
            operationId: 'testOp',
            method: 'GET',
            path: '/test',
            parameters: [],
            returnType: { rawType: 'void' } as any,
          },
        ],
      ]),
    };

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Intercept Promise method body generation
    const promiseMethodCall = classMock.addMethod.mock.calls.find(
      (c: any) => c[0].name === 'testOp',
    );
    expect(promiseMethodCall).toBeDefined();

    // Verify setBodyText logic via mock writer
    const writerCallback = methodMock.setBodyText.mock.calls[1][0]; // 0 is Observable, 1 is Promise
    const writerMock = { writeLine: vi.fn() };
    writerCallback(writerMock);

    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'return firstValueFrom(this.testOp$()).then(response => response.data);',
      ),
    );
  });

  it('should generate correct body for Observable GET with single query param in params object', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'search',
          {
            operationId: 'searchUsers',
            methodName: 'search',
            method: 'GET',
            path: '/users',
            parameters: [{ name: 'q', in: 'query', type: { rawType: 'string' } } as any],
            returnType: { rawType: 'UserDto[]' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('UserDto[]');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Get callback for Observable method
    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    // Verify URL normalization
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedBase = (this.config.baseUrl ?? '').replace(/\\/$/, '');",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedPath = `/users`.replace(/^\\//, '');",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const url = normalizedBase ? `${normalizedBase}/${normalizedPath}` : `/${normalizedPath}`;',
    );

    // Query params now grouped in params object
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const queryParams: Record<string, any> = {};',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('if (params) {');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params.q !== undefined) queryParams['q'] = params.q;",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('}');

    // Verify Headers
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const headers: Record<string, string> = { ...(this.config.headers ?? {}) };',
    );

    // Verify HTTP Call with queryParams and headers
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'this.httpService.get<UserDto[]>(url, { ...this.config.httpOptions, params: queryParams, headers })',
      ),
    );
  });

  it('should group multiple query parameters into an object', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'search',
          {
            operationId: 'searchUsers',
            methodName: 'search',
            method: 'GET',
            path: '/users',
            parameters: [
              { name: 'q', in: 'query', type: { rawType: 'string' }, isRequired: true } as any,
              { name: 'limit', in: 'query', type: { rawType: 'number' } } as any,
              { name: 'offset', in: 'query', type: { rawType: 'number' } } as any,
            ],
            returnType: { rawType: 'UserDto[]' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('UserDto[]');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Verify the method signature has 'params' object parameter
    expect(classMock.addMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'search$',
        parameters: expect.arrayContaining([
          {
            name: 'params',
            type: expect.stringContaining('q'),
            hasQuestionToken: true,
          },
        ]),
      }),
    );

    // Get callback for Observable method
    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    // Verify params are grouped
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const queryParams: Record<string, any> = {};',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('if (params) {');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params.q !== undefined) queryParams['q'] = params.q;",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params.limit !== undefined) queryParams['limit'] = params.limit;",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params.offset !== undefined) queryParams['offset'] = params.offset;",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('}');
  });

  it('should generate correct body for POST with body and headers', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'create',
          {
            operationId: 'createUser',
            methodName: 'create',
            method: 'POST',
            path: '/users',
            parameters: [
              { name: 'payload', in: 'body', type: { rawType: 'Dto' }, isRequired: true } as any,
              { name: 'X-Auth', in: 'header', type: { rawType: 'string' } } as any,
            ],
            returnType: { rawType: 'Dto' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    // Verify Headers - now extracted from params object
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const headers: Record<string, string> = { ...(this.config.headers ?? {}) };',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('if (params) {');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params['X-Auth'] !== undefined) headers['X-Auth'] = String(params['X-Auth']);",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('}');

    // Verify HTTP Call (POST has body, no query params, just headers config)
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'this.httpService.post<string>(url, payload, { ...this.config.httpOptions, headers })',
      ),
    );
  });

  it('should generate DELETE request with path param in params object', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'remove',
          {
            operationId: 'deleteUser',
            methodName: 'remove',
            method: 'DELETE',
            path: '/users/{id}',
            parameters: [
              { name: 'id', in: 'path', type: { rawType: 'string' }, isRequired: true } as any,
            ],
            returnType: { rawType: 'string' } as any,
          },
        ],
      ]),
    };

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = { writeLine: vi.fn(), write: vi.fn() };
    writerCallback(writerMock);

    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedBase = (this.config.baseUrl ?? '').replace(/\\/$/, '');",
    );
    // Required path param now accessed directly (not from params object)
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedPath = `/users/${id}`.replace(/^\\//, '');",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const url = normalizedBase ? `${normalizedBase}/${normalizedPath}` : `/${normalizedPath}`;',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const headers: Record<string, string> = { ...(this.config.headers ?? {}) };',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'return this.httpService.delete<string>(url, { ...this.config.httpOptions, headers });',
    );
  });

  it('should generate POST request with query params in params object and no body', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'search',
          {
            operationId: 'searchUsers',
            methodName: 'search',
            method: 'POST',
            path: '/users/search',
            parameters: [
              { name: 'q', in: 'query', type: { rawType: 'string' }, isRequired: false } as any,
            ],
            returnType: { rawType: 'string' } as any,
          },
        ],
      ]),
    };

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const queryParams: Record<string, any> = {};',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('if (params) {');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params.q !== undefined) queryParams['q'] = params.q;",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('}');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const headers: Record<string, string> = { ...(this.config.headers ?? {}) };',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'this.httpService.post<string>(url, undefined, { ...this.config.httpOptions, params: queryParams, headers })',
      ),
    );
  });

  it('should generate PUT request with headers in params object', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'update',
          {
            operationId: 'updateUser',
            methodName: 'update',
            method: 'PUT',
            path: '/users/update',
            parameters: [
              {
                name: 'X-Token',
                in: 'header',
                type: { rawType: 'string' },
                isRequired: false,
              } as any,
            ],
            returnType: { rawType: 'string' } as any,
          },
        ],
      ]),
    };

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const headers: Record<string, string> = { ...(this.config.headers ?? {}) };',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('if (params) {');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params['X-Token'] !== undefined) headers['X-Token'] = String(params['X-Token']);",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('}');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'this.httpService.put<string>(url, undefined, { ...this.config.httpOptions, headers })',
      ),
    );
  });

  it('should generate POST request with body only (no config)', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'create',
          {
            operationId: 'createUser',
            methodName: 'create',
            method: 'POST',
            path: '/users',
            parameters: [
              {
                name: 'payload',
                in: 'body',
                type: { rawType: 'CreateUserDto' },
                isRequired: true,
              } as any,
            ],
            returnType: { rawType: 'UserDto' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('UserDto');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = { writeLine: vi.fn(), write: vi.fn() };
    writerCallback(writerMock);

    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedBase = (this.config.baseUrl ?? '').replace(/\\/$/, '');",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedPath = `/users`.replace(/^\\//, '');",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const url = normalizedBase ? `${normalizedBase}/${normalizedPath}` : `/${normalizedPath}`;',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const headers: Record<string, string> = { ...(this.config.headers ?? {}) };',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'return this.httpService.post<UserDto>(url, payload, { ...this.config.httpOptions, headers });',
    );
  });

  it('should generate Promise method with JSDoc description', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'getUser',
          {
            operationId: 'getUser',
            methodName: 'getUser',
            method: 'GET',
            path: '/users/{id}',
            description: 'Fetches user details by ID',
            parameters: [
              { name: 'id', in: 'path', type: { rawType: 'string' }, isRequired: true } as any,
            ],
            returnType: { rawType: 'UserDto' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('UserDto');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Verify Promise method has docs
    const promiseMethodCall = classMock.addMethod.mock.calls.find(
      (c: any) => c[0].name === 'getUser',
    );
    expect(promiseMethodCall).toBeDefined();
    expect(promiseMethodCall![0].docs).toEqual([{ description: 'Fetches user details by ID' }]);

    // Verify method signature has required path param as separate argument
    expect(promiseMethodCall![0].parameters).toEqual([
      {
        name: 'id',
        type: 'UserDto',
        hasQuestionToken: false,
      },
    ]);
  });

  it('should execute Promise method body callback correctly with params object', async () => {
    const service: IrService = {
      name: 'TestService',
      operations: new Map([
        [
          'fetchData',
          {
            operationId: 'fetchData',
            methodName: 'fetchData',
            method: 'GET',
            path: '/data',
            parameters: [
              { name: 'id', in: 'query', type: { rawType: 'string' }, isRequired: false } as any,
              { name: 'limit', in: 'query', type: { rawType: 'number' }, isRequired: false } as any,
            ],
            returnType: { rawType: 'DataDto' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Get Promise method body callback (second call to setBodyText)
    const promiseBodyCallback = methodMock.setBodyText.mock.calls[1][0];
    const writerMock = { writeLine: vi.fn() };
    promiseBodyCallback(writerMock);

    // Now forwards params object instead of individual params
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'return firstValueFrom(this.fetchData$(params)).then(response => response.data);',
      ),
    );
  });

  it('should handle operations with mixed parameter types (path + query + header + body)', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'complexOperation',
          {
            operationId: 'complexOperation',
            methodName: 'complexOperation',
            method: 'POST',
            path: '/users/{userId}/posts/{postId}',
            parameters: [
              { name: 'userId', in: 'path', type: { rawType: 'string' }, isRequired: true } as any,
              { name: 'postId', in: 'path', type: { rawType: 'string' }, isRequired: true } as any,
              {
                name: 'filter',
                in: 'query',
                type: { rawType: 'string' },
                isRequired: false,
              } as any,
              { name: 'limit', in: 'query', type: { rawType: 'number' }, isRequired: false } as any,
              {
                name: 'X-Tenant-Id',
                in: 'header',
                type: { rawType: 'string' },
                isRequired: false,
              } as any,
              {
                name: 'payload',
                in: 'body',
                type: { rawType: 'CreateDto' },
                isRequired: true,
              } as any,
            ],
            returnType: { rawType: 'ResultDto' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Verify method signature: body first, then required path params, then optional params object
    const methodCall = classMock.addMethod.mock.calls.find(
      (c: any) => c[0].name === 'complexOperation$',
    );
    expect(methodCall).toBeDefined();
    expect(methodCall![0].parameters).toHaveLength(4);
    expect(methodCall![0].parameters[0].name).toBe('payload');
    expect(methodCall![0].parameters[1].name).toBe('userId');
    expect(methodCall![0].parameters[1].hasQuestionToken).toBe(false); // required
    expect(methodCall![0].parameters[2].name).toBe('postId');
    expect(methodCall![0].parameters[2].hasQuestionToken).toBe(false); // required
    expect(methodCall![0].parameters[3].name).toBe('params');
    expect(methodCall![0].parameters[3].type).toContain('filter');
    expect(methodCall![0].parameters[3].type).toContain('X-Tenant-Id');

    // Verify method body
    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    // Path params interpolated directly (not from params object)
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedPath = `/users/${userId}/posts/${postId}`.replace(/^\\//, '');",
    );

    // Query params extracted from params
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const queryParams: Record<string, any> = {};',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('if (params) {');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params.filter !== undefined) queryParams['filter'] = params.filter;",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params.limit !== undefined) queryParams['limit'] = params.limit;",
    );

    // Headers extracted from params
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params['X-Tenant-Id'] !== undefined) headers['X-Tenant-Id'] = String(params['X-Tenant-Id']);",
    );

    // HTTP call with body
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'this.httpService.post<string>(url, payload, { ...this.config.httpOptions, params: queryParams, headers })',
      ),
    );
  });

  it('should handle operations with many query parameters (5+)', async () => {
    const service: IrService = {
      name: 'SearchService',
      operations: new Map([
        [
          'advancedSearch',
          {
            operationId: 'advancedSearch',
            methodName: 'advancedSearch',
            method: 'GET',
            path: '/search',
            parameters: [
              { name: 'query', in: 'query', type: { rawType: 'string' }, isRequired: false } as any,
              {
                name: 'category',
                in: 'query',
                type: { rawType: 'string' },
                isRequired: false,
              } as any,
              {
                name: 'minPrice',
                in: 'query',
                type: { rawType: 'number' },
                isRequired: false,
              } as any,
              {
                name: 'maxPrice',
                in: 'query',
                type: { rawType: 'number' },
                isRequired: false,
              } as any,
              { name: 'page', in: 'query', type: { rawType: 'number' }, isRequired: false } as any,
              {
                name: 'pageSize',
                in: 'query',
                type: { rawType: 'number' },
                isRequired: false,
              } as any,
              {
                name: 'sortBy',
                in: 'query',
                type: { rawType: 'string' },
                isRequired: false,
              } as any,
            ],
            returnType: { rawType: 'SearchResult[]' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Verify all query params are in params object
    const methodCall = classMock.addMethod.mock.calls.find(
      (c: any) => c[0].name === 'advancedSearch$',
    );
    expect(methodCall).toBeDefined();
    expect(methodCall![0].parameters).toHaveLength(1);
    expect(methodCall![0].parameters[0].name).toBe('params');
    expect(methodCall![0].parameters[0].type).toContain('query');
    expect(methodCall![0].parameters[0].type).toContain('category');
    expect(methodCall![0].parameters[0].type).toContain('minPrice');
    expect(methodCall![0].parameters[0].type).toContain('maxPrice');
    expect(methodCall![0].parameters[0].type).toContain('page');
    expect(methodCall![0].parameters[0].type).toContain('pageSize');
    expect(methodCall![0].parameters[0].type).toContain('sortBy');
  });

  it('should handle required path parameters as separate arguments', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'getUserPosts',
          {
            operationId: 'getUserPosts',
            methodName: 'getUserPosts',
            method: 'GET',
            path: '/users/{userId}/posts',
            parameters: [
              { name: 'userId', in: 'path', type: { rawType: 'string' }, isRequired: true } as any,
              {
                name: 'status',
                in: 'query',
                type: { rawType: 'string' },
                isRequired: false,
              } as any,
            ],
            returnType: { rawType: 'Post[]' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Verify signature: userId is a required separate argument, params contains only query params
    const methodCall = classMock.addMethod.mock.calls.find(
      (c: any) => c[0].name === 'getUserPosts$',
    );
    expect(methodCall).toBeDefined();
    expect(methodCall![0].parameters).toHaveLength(2);

    // First param is the required path param
    expect(methodCall![0].parameters[0].name).toBe('userId');
    expect(methodCall![0].parameters[0].hasQuestionToken).toBe(false);

    // Second param is the params object with query params
    expect(methodCall![0].parameters[1].name).toBe('params');
    expect(methodCall![0].parameters[1].hasQuestionToken).toBe(true);
    expect(methodCall![0].parameters[1].type).toMatch(/status\?:\s*string/);
  });

  it('should handle operations with only path parameters', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'getUser',
          {
            operationId: 'getUser',
            methodName: 'getUser',
            method: 'GET',
            path: '/users/{userId}',
            parameters: [
              { name: 'userId', in: 'path', type: { rawType: 'string' }, isRequired: true } as any,
            ],
            returnType: { rawType: 'User' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Verify required path param is a separate argument, not in params object
    const methodCall = classMock.addMethod.mock.calls.find((c: any) => c[0].name === 'getUser$');
    expect(methodCall).toBeDefined();
    expect(methodCall![0].parameters).toHaveLength(1);
    expect(methodCall![0].parameters[0].name).toBe('userId');
    expect(methodCall![0].parameters[0].hasQuestionToken).toBe(false);

    // Verify URL interpolation uses direct argument
    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = { writeLine: vi.fn(), write: vi.fn() };
    writerCallback(writerMock);

    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedPath = `/users/${userId}`.replace(/^\\//, '');",
    );
  });

  it('should handle POST with body and params (query + path)', async () => {
    const service: IrService = {
      name: 'PostService',
      operations: new Map([
        [
          'createComment',
          {
            operationId: 'createComment',
            methodName: 'createComment',
            method: 'POST',
            path: '/posts/{postId}/comments',
            parameters: [
              { name: 'postId', in: 'path', type: { rawType: 'string' }, isRequired: true } as any,
              {
                name: 'notify',
                in: 'query',
                type: { rawType: 'boolean' },
                isRequired: false,
              } as any,
              {
                name: 'comment',
                in: 'body',
                type: { rawType: 'CommentDto' },
                isRequired: true,
              } as any,
            ],
            returnType: { rawType: 'Comment' } as any,
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Verify signature: body first, required path param second, params third
    const methodCall = classMock.addMethod.mock.calls.find(
      (c: any) => c[0].name === 'createComment$',
    );
    expect(methodCall).toBeDefined();
    expect(methodCall![0].parameters).toHaveLength(3);
    expect(methodCall![0].parameters[0].name).toBe('comment');
    expect(methodCall![0].parameters[0].hasQuestionToken).toBe(false); // required body
    expect(methodCall![0].parameters[1].name).toBe('postId');
    expect(methodCall![0].parameters[1].hasQuestionToken).toBe(false); // required path param
    expect(methodCall![0].parameters[2].name).toBe('params');
    expect(methodCall![0].parameters[2].type).toContain('notify');

    // Verify method body handles both path and query params
    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    // Path param in URL (required path params are now separate arguments)
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "const normalizedPath = `/posts/${postId}/comments`.replace(/^\\//, '');",
    );

    // Query param extracted
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const queryParams: Record<string, any> = {};',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith('if (params) {');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (params.notify !== undefined) queryParams['notify'] = params.notify;",
    );

    // HTTP call with body and params
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'this.httpService.post<string>(url, comment, { ...this.config.httpOptions, params: queryParams, headers })',
      ),
    );
  });

  it('should handle multipart/form-data uploads with Accept and responseType', async () => {
    const service: IrService = {
      name: 'ImageService',
      operations: new Map([
        [
          'uploadImage',
          {
            methodName: 'uploadImage',
            operationId: 'uploadImage',
            method: 'POST',
            path: '/users/{userId}/images',
            parameters: [
              { name: 'userId', type: { rawType: 'string' }, isRequired: true, in: 'path' } as any,
              { name: 'body', type: { rawType: 'any' }, isRequired: false, in: 'body' } as any,
              { name: 'name', type: { rawType: 'string' }, isRequired: false, in: 'query' } as any,
            ],
            returnType: { rawType: 'string' } as any,
            requestContentType: 'multipart/form-data',
            acceptHeader: 'text/plain',
            responseType: 'text',
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockImplementation((t) => {
      if (t.rawType === 'string') return 'string';
      if (t.rawType === 'any') return 'any';
      return typeof t.rawType === 'string' ? t.rawType : 'any';
    });

    const writer = new ServiceWriter(projectMock, outputDir, []);
    await writer.writeAll([service]);

    // Verify method signature: userId (required path) first, body (optional) second, params third
    const methodCall = classMock.addMethod.mock.calls.find(
      (c: any) => c[0].name === 'uploadImage$',
    );
    expect(methodCall).toBeDefined();
    expect(methodCall![0].parameters).toHaveLength(3);
    expect(methodCall![0].parameters[0].name).toBe('userId');
    expect(methodCall![0].parameters[0].hasQuestionToken).toBe(false); // required path param
    expect(methodCall![0].parameters[1].name).toBe('body');
    expect(methodCall![0].parameters[1].hasQuestionToken).toBe(true); // optional body
    expect(methodCall![0].parameters[2].name).toBe('params');
    expect(methodCall![0].parameters[2].hasQuestionToken).toBe(true); // optional

    // Verify method body
    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    // Check Accept header is set
    expect(writerMock.writeLine).toHaveBeenCalledWith("headers['Accept'] = 'text/plain';");

    // Check responseType is included in config
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining("responseType: 'text'"),
    );

    // Check that multipart Content-Type is NOT set (axios will set it with boundary)
    expect(writerMock.writeLine).not.toHaveBeenCalledWith(
      expect.stringContaining("headers['Content-Type'] = 'multipart/form-data'"),
    );
  });

  it('should handle Buffer responses for image endpoints', async () => {
    const service: IrService = {
      name: 'ImageService',
      operations: new Map([
        [
          'getImage',
          {
            methodName: 'getImage',
            operationId: 'getImage',
            method: 'GET',
            path: '/images/{imageId}',
            parameters: [
              { name: 'imageId', type: { rawType: 'string' }, isRequired: true, in: 'path' } as any,
            ],
            returnType: { rawType: 'Buffer' } as any,
            acceptHeader: 'image/png',
            responseType: 'arraybuffer',
          },
        ],
      ]),
    };

    vi.mocked(TypeHelper.irTypeToString).mockImplementation((t) => {
      return t.rawType === 'Buffer' ? 'Buffer' : 'string';
    });

    const writer = new ServiceWriter(projectMock, outputDir, []);
    await writer.writeAll([service]);

    // Verify method body
    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    // Check Accept header is set
    expect(writerMock.writeLine).toHaveBeenCalledWith("headers['Accept'] = 'image/png';");

    // Check responseType is arraybuffer (for Node.js Buffer)
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining("responseType: 'arraybuffer'"),
    );
  });

  it('should include JSDoc for parameter description in params object', async () => {
    const service: IrService = {
      name: 'UserService',
      operations: new Map([
        [
          'getUser',
          {
            methodName: 'getUser',
            operationId: 'getUser',
            method: 'GET',
            path: '/users',
            parameters: [
              {
                name: 'filter',
                type: { rawType: 'string' },
                isRequired: false,
                in: 'query',
                description: 'Filter users by name',
              } as any,
            ],
            returnType: { rawType: 'User[]' } as any,
          },
        ],
      ]),
    };

    const writer = new ServiceWriter(projectMock, outputDir, []);
    await writer.writeAll([service]);

    // Check that the parameter type definition includes the description (it's in the inline type string)
    const methodCall = classMock.addMethod.mock.calls.find((call: any) =>
      call[0].name.includes('getUser'),
    );
    expect(methodCall).toBeDefined();
    const paramType = methodCall[0].parameters[0].type;
    expect(paramType).toContain('Filter users by name');
  });

  it('should handle non-JSON Content-Type headers (except multipart)', async () => {
    const service: IrService = {
      name: 'FileService',
      operations: new Map([
        [
          'uploadText',
          {
            methodName: 'uploadText',
            operationId: 'uploadText',
            method: 'POST',
            path: '/files/text',
            parameters: [
              { name: 'body', type: { rawType: 'string' }, isRequired: false, in: 'body' } as any,
            ],
            returnType: { rawType: 'void' } as any,
            requestContentType: 'text/plain',
          },
        ],
      ]),
    };

    const writer = new ServiceWriter(projectMock, outputDir, []);
    await writer.writeAll([service]);

    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = {
      writeLine: vi.fn(),
      write: vi.fn(),
      indent: vi.fn().mockImplementation((cb) => cb()),
    };
    writerCallback(writerMock);

    // Check that text/plain Content-Type IS set (it's not multipart)
    expect(writerMock.writeLine).toHaveBeenCalledWith("headers['Content-Type'] = 'text/plain';");
  });
});
