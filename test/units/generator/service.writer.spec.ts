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

    // Check Constructor Injection
    expect(classMock.addConstructor).toHaveBeenCalledWith({
      parameters: [
        {
          name: 'httpService',
          type: 'HttpService',
          isReadonly: true,
          scope: expect.anything(),
        },
      ],
    });
  });

  it('should generate Observable and Promise methods for GET operation', async () => {
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

    // FIX: Usiamo mockImplementation per gestire dinamicamente i tipi
    // Se il tipo raw è 'UserDto' ritorna 'UserDto', altrimenti 'string' (per il parametro id)
    vi.mocked(TypeHelper.irTypeToString).mockImplementation((t) => {
      return t.rawType === 'UserDto' ? 'UserDto' : 'string';
    });

    const writer = new ServiceWriter(projectMock, outputDir, []);
    await writer.writeAll([service]);

    // Check Observable Method Definition
    expect(classMock.addMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'getUser$',
        returnType: 'Observable<UserDto>',
        // Verifichiamo anche che il parametro abbia il tipo giusto
        parameters: expect.arrayContaining([
          { name: 'id', type: 'string', hasQuestionToken: false },
        ]),
      }),
    );

    // Check Promise Method Definition
    expect(classMock.addMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'getUser',
        returnType: 'Promise<UserDto>',
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

    expect(writerMock.writeLine).toHaveBeenCalledWith('return firstValueFrom(this.testOp$());');
  });

  it('should generate correct body for Observable GET with params', async () => {
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

    // Qui mockiamo staticamente perché ci interessa solo la generazione del corpo, non la firma
    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('UserDto[]');

    const writer = new ServiceWriter(projectMock, outputDir);
    await writer.writeAll([service]);

    // Get callback for Observable method
    const writerCallback = methodMock.setBodyText.mock.calls[0][0];
    const writerMock = { writeLine: vi.fn(), write: vi.fn() };
    writerCallback(writerMock);

    // Verify URL
    expect(writerMock.writeLine).toHaveBeenCalledWith('const url = `/users`;');

    // Verify Query Params Logic
    expect(writerMock.writeLine).toHaveBeenCalledWith('const params: Record<string, any> = {};');
    expect(writerMock.writeLine).toHaveBeenCalledWith("if (q !== undefined) params['q'] = q;");

    // Verify HTTP Call
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining('this.httpService.get<UserDto[]>(url, { params })'),
    );
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
              { name: 'payload', in: 'body', type: { rawType: 'Dto' } } as any,
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
    const writerMock = { writeLine: vi.fn(), write: vi.fn() };
    writerCallback(writerMock);

    // Verify Headers
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const headers: Record<string, string> = {};',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (X-Auth !== undefined) headers['X-Auth'] = String(X-Auth);",
    );

    // Verify HTTP Call (POST has body)
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining('this.httpService.post<string>(url, payload, { headers })'),
    );
  });

  it('should generate DELETE request without params or config', async () => {
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

    expect(writerMock.writeLine).toHaveBeenCalledWith('const url = `/users/${id}`;');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'return this.httpService.delete<string>(url).pipe(map((response) => response.data));',
    );
  });

  it('should generate POST request with query params and no body', async () => {
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
    const writerMock = { writeLine: vi.fn(), write: vi.fn() };
    writerCallback(writerMock);

    expect(writerMock.writeLine).toHaveBeenCalledWith('const params: Record<string, any> = {};');
    expect(writerMock.writeLine).toHaveBeenCalledWith("if (q !== undefined) params['q'] = q;");
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining('this.httpService.post<string>(url, undefined, { params })'),
    );
  });

  it('should generate PUT request with headers only', async () => {
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
    const writerMock = { writeLine: vi.fn(), write: vi.fn() };
    writerCallback(writerMock);

    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'const headers: Record<string, string> = {};',
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      "if (X-Token !== undefined) headers['X-Token'] = String(X-Token);",
    );
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      expect.stringContaining('this.httpService.put<string>(url, undefined, { headers })'),
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

    expect(writerMock.writeLine).toHaveBeenCalledWith('const url = `/users`;');
    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'return this.httpService.post<UserDto>(url, payload).pipe(map((response) => response.data));',
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
  });

  it('should execute Promise method body callback correctly', async () => {
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

    expect(writerMock.writeLine).toHaveBeenCalledWith(
      'return firstValueFrom(this.fetchData$(id, limit));',
    );
  });
});
