import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { ServiceStatementBuilder } from '../../../src/core/generator/writers/core/service-statement-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';

describe('ServiceStatementBuilder', () => {
  let builder: ServiceStatementBuilder;
  let printer: AstPrinter;
  let typeBuilder: TypeBuilder;

  beforeEach(() => {
    builder = new ServiceStatementBuilder();
    printer = new AstPrinter();
    typeBuilder = new TypeBuilder();
  });

  it('should build a path constant with template literals', async () => {
    const pathTemplate = '/users/{userId}/posts/{postId}';
    const node = builder.buildPathConst(pathTemplate);

    const output = await printer.print([node]);

    expect(output.generatedCode).toContain('const path = `/users/${userId}/posts/${postId}`;');
  });

  it('should build URL statements with baseUrl normalization', async () => {
    const nodes = builder.buildUrlStatements('/users/{userId}/posts');

    const output = await printer.print(nodes);

    expect(output.generatedCode).toContain('const normalizedBase');
    expect(output.generatedCode).toContain("this.config.baseUrl ?? ''");
    expect(output.generatedCode).toContain('const normalizedPath');
    expect(output.generatedCode).toContain('/users/${userId}/posts');
    expect(output.generatedCode).toContain('const url = normalizedBase');
    expect(output.generatedCode).toContain('`${normalizedBase}/${normalizedPath}`');
    expect(output.generatedCode).toContain('`/${normalizedPath}`');
  });

  it('should build the Promise return wrapper statement', async () => {
    const node = builder.buildPromiseReturn('getUserById$', ['id', 'params']);

    const output = await printer.print([node]);

    expect(output.generatedCode).toContain(
      'return firstValueFrom(this.getUserById$(id, params)).then(',
    );
    expect(output.generatedCode).toContain('(res) => res.data');
  });

  it('should build a GET HTTP call extracting query params from the params object', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'get',
      queryParams: ['text', 'apiKey'],
      hasOptionalParams: true,
      acceptHeader: 'application/json',
    });

    const output = await printer.print(statements);

    // Query params extracted individually from params
    expect(output.generatedCode).toContain('const queryParams: Record<string, any> = {};');
    expect(output.generatedCode).toContain('if (params)');
    expect(output.generatedCode).toContain('if (params.text !== undefined)');
    expect(output.generatedCode).toContain("queryParams['text'] = params.text");
    expect(output.generatedCode).toContain('if (params.apiKey !== undefined)');
    expect(output.generatedCode).toContain("queryParams['apiKey'] = params.apiKey");

    // Headers: config.headers spread first, then Accept overrides
    expect(output.generatedCode).toContain('const headers: Record<string, string>');
    expect(output.generatedCode).toContain('this.config.headers ?? {}');
    expect(output.generatedCode).toContain("headers['Accept'] = 'application/json'");

    // Config object: httpOptions first, then params/headers
    expect(output.generatedCode).toContain('return this.httpService.get(url,');
    expect(output.generatedCode).toContain('...this.config.httpOptions');
    expect(output.generatedCode).toContain('params: queryParams');
    expect(output.generatedCode).toContain('headers');
  });

  it('should build a POST HTTP call with body and skip application/json Content-Type', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'post',
      bodyVar: 'userDto',
      contentTypeHeader: 'application/json',
      responseType: 'blob',
    });

    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('return this.httpService.post(url, userDto,');
    expect(output.generatedCode).not.toContain('params: queryParams');
    // application/json is Axios default — should NOT be emitted
    expect(output.generatedCode).not.toContain("'Content-Type'");
    expect(output.generatedCode).toContain("responseType: 'blob'");
  });

  it('should skip multipart/form-data Content-Type header and use toFormData for body', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'post',
      bodyVar: 'file',
      contentTypeHeader: 'multipart/form-data',
      isFormData: true,
    });

    const output = await printer.print(statements);

    // multipart/form-data Content-Type should NOT be emitted (Axios sets boundary)
    expect(output.generatedCode).not.toContain("'Content-Type'");
    // Body should be wrapped: file ? toFormData(file) : undefined
    expect(output.generatedCode).toContain('file ? toFormData(file) : undefined');
  });

  it('should emit non-standard Content-Type headers', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'post',
      bodyVar: 'body',
      contentTypeHeader: 'text/plain',
    });

    const output = await printer.print(statements);

    expect(output.generatedCode).toContain("headers['Content-Type'] = 'text/plain'");
  });

  it('should include generic type parameter on the HTTP call', async () => {
    const returnType = typeBuilder.createReference('UserDto');

    const statements = builder.buildHttpCall({
      httpMethod: 'get',
      returnType,
    });

    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('return this.httpService.get<UserDto>(url,');
  });

  it('should extract header params from params object into headers', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'get',
      headerParams: ['authorization', 'X-Request-Id'],
      hasOptionalParams: true,
      acceptHeader: 'application/json',
    });

    const output = await printer.print(statements);

    // Header params extracted from params with String() coercion
    expect(output.generatedCode).toContain('if (params)');
    expect(output.generatedCode).toContain("params['authorization'] !== undefined");
    expect(output.generatedCode).toContain(
      "headers['authorization'] = String(params['authorization'])",
    );
    expect(output.generatedCode).toContain("params['X-Request-Id'] !== undefined");
    expect(output.generatedCode).toContain(
      "headers['X-Request-Id'] = String(params['X-Request-Id'])",
    );
  });

  it('should build a PUT HTTP call without body passing undefined', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'put',
      hasOptionalParams: true,
      queryParams: ['status'],
    });

    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('return this.httpService.put(url, undefined,');
    expect(output.generatedCode).toContain("queryParams['status'] = params.status");
    expect(output.generatedCode).toContain('params: queryParams');
  });

  it('should place httpOptions spread first in the config object', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'get',
      acceptHeader: 'application/json',
    });

    const output = await printer.print(statements);

    const httpOptionsPos = output.generatedCode.indexOf('...this.config.httpOptions');
    const headersPos = output.generatedCode.indexOf('headers', httpOptionsPos + 1);

    expect(httpOptionsPos).toBeGreaterThan(-1);
    expect(headersPos).toBeGreaterThan(httpOptionsPos);
  });
});
