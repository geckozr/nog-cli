import ts from 'typescript';
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

  it('emits a single rb.buildUrl statement with the path template as a plain string literal and a shorthand path-params object', async () => {
    const nodes = builder.buildUrlStatements('/users/{userId}/posts/{postId}', [
      'userId',
      'postId',
    ]);
    const output = await printer.print(nodes);

    expect(nodes).toHaveLength(1);
    expect(output.generatedCode).toMatch(
      /const url = this\.rb\.buildUrl\(\s*'\/users\/\{userId\}\/posts\/\{postId\}',\s*\{\s*userId,\s*postId,?\s*\},?\s*\);/,
    );
  });

  it('omits the path-params object when there are no path placeholders', async () => {
    const nodes = builder.buildUrlStatements('/health', []);
    const output = await printer.print(nodes);

    expect(output.generatedCode).toMatch(/const url = this\.rb\.buildUrl\(\s*'\/health',?\s*\);/);
  });

  it('emits the path template verbatim — no Identifier carries a backtick or interpolation', () => {
    const nodes = builder.buildUrlStatements('/users/{userId}/posts/{postId}', [
      'userId',
      'postId',
    ]);
    const offenders: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && (node.text.includes('`') || node.text.includes('${'))) {
        offenders.push(node.text);
      }
      ts.forEachChild(node, visit);
    };
    for (const node of nodes) visit(node);
    expect(offenders).toEqual([]);
  });

  it('builds the Promise return wrapper statement', async () => {
    const node = builder.buildPromiseReturn('getUserById$', ['id', 'params']);
    const output = await printer.print([node]);

    expect(output.generatedCode).toContain(
      'return firstValueFrom(this.getUserById$(id, params)).then(',
    );
    expect(output.generatedCode).toContain('(res) => res.data');
  });

  it('builds a GET HTTP call delegating query extraction to rb.buildQuery and header setup to plain spread', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'get',
      queryParams: ['text', 'apiKey'],
      hasOptionalParams: true,
      acceptHeader: 'application/json',
    });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('const queryParams = this.rb.buildQuery(');
    expect(output.generatedCode).toContain('params?.query');
    expect(output.generatedCode).toContain("'text'");
    expect(output.generatedCode).toContain("'apiKey'");
    expect(output.generatedCode).toContain('] as const');

    expect(output.generatedCode).toContain('const headers: Record<string, string>');
    expect(output.generatedCode).toContain('this.config.headers ?? {}');
    expect(output.generatedCode).toContain("headers['Accept'] = 'application/json'");

    expect(output.generatedCode).toContain('return this.httpService.get(url,');
    expect(output.generatedCode).toContain('...this.config.httpOptions');
    expect(output.generatedCode).toContain('params: queryParams');
  });

  it('emits an OpenAPI styles map when at least one query param has a non-default style+explode pair', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'get',
      queryParams: ['ids', 'tags', 'coords', 'filter', 'limit'],
      queryParamMeta: {
        ids: { style: 'form', explode: false },
        tags: { style: 'pipeDelimited' },
        coords: { style: 'spaceDelimited' },
        filter: { style: 'deepObject' },
      },
    });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('this.rb.buildQuery(');
    expect(output.generatedCode).toContain("ids: 'csv'");
    expect(output.generatedCode).toContain("tags: 'pipe'");
    expect(output.generatedCode).toContain("coords: 'space'");
    expect(output.generatedCode).toContain("filter: 'deep'");
  });

  it('emits the buildQuery call with no styles arg when every query param uses the OpenAPI default (form + explode:true)', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'get',
      queryParams: ['plain'],
      queryParamMeta: { plain: { style: 'form', explode: true } },
    });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('this.rb.buildQuery(');
    expect(output.generatedCode).toContain("'plain'");
    expect(output.generatedCode).toMatch(/\] as const\s*\);/);
  });

  it('routes header params through rb.buildHeaders with a static whitelist, skipping the plain spread baseline', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'get',
      headerParams: ['authorization', 'X-Request-Id'],
      hasOptionalParams: true,
      acceptHeader: 'application/json',
    });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('const headers = this.rb.buildHeaders(');
    expect(output.generatedCode).toContain('this.config.headers');
    expect(output.generatedCode).toContain('params?.headers');
    expect(output.generatedCode).toContain("'authorization'");
    expect(output.generatedCode).toContain("'X-Request-Id'");
    expect(output.generatedCode).toContain("headers['Accept'] = 'application/json'");
  });

  it('builds a POST HTTP call with body and skips application/json Content-Type', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'post',
      bodyVar: 'userDto',
      contentTypeHeader: 'application/json',
      responseType: 'blob',
    });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('return this.httpService.post(url, userDto,');
    expect(output.generatedCode).toContain("responseType: 'blob'");
  });

  it('emits multipart/form-data Content-Type header and passes body raw (axios auto-serializes)', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'post',
      bodyVar: 'file',
      contentTypeHeader: 'multipart/form-data',
      isFormData: true,
    });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain("headers['Content-Type'] = 'multipart/form-data'");
    expect(output.generatedCode).toContain('return this.httpService.post(url, file,');
  });

  it('emits non-standard Content-Type headers after the header setup', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'post',
      bodyVar: 'body',
      contentTypeHeader: 'text/plain',
    });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain("headers['Content-Type'] = 'text/plain'");
  });

  it('includes the generic type parameter on the HTTP call', async () => {
    const returnType = typeBuilder.createReference('UserDto');
    const statements = builder.buildHttpCall({ httpMethod: 'get', returnType });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('return this.httpService.get<UserDto>(url,');
  });

  it('builds a PUT HTTP call without body passing undefined', async () => {
    const statements = builder.buildHttpCall({
      httpMethod: 'put',
      hasOptionalParams: true,
      queryParams: ['status'],
    });
    const output = await printer.print(statements);

    expect(output.generatedCode).toContain('return this.httpService.put(url, undefined,');
    expect(output.generatedCode).toMatch(
      /const queryParams = this\.rb\.buildQuery\(\s*params\?\.query,\s*\['status'\] as const,?\s*\);/,
    );
    expect(output.generatedCode).toContain('params: queryParams');
  });

  it('places httpOptions spread first in the axios config object', async () => {
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
