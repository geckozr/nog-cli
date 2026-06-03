import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { DecoratorBuilder } from '../../../src/core/generator/writers/core/decorator-builder';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../../src/core/generator/writers/core/import-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';
import { RequestBuilderWriter } from '../../../src/core/generator/writers/request-builder.writer';

describe('RequestBuilderWriter', () => {
  let writer: RequestBuilderWriter;

  beforeEach(() => {
    writer = new RequestBuilderWriter(
      new AstPrinter(),
      new HeaderGenerator(),
      new ImportBuilder(),
      new TypeBuilder(),
      new DecoratorBuilder(),
    );
  });

  it('emits a stateless @Injectable RequestBuilder service with the three public methods', async () => {
    const result = await writer.write('1.0.0', 'OpenAPI TEST', '3.1.0');

    expect(result.filename).toBe('request-builder.service.ts');

    const output = result.generatedCode;

    expect(output).toContain('generated with nog-cli v1.0.0');
    expect(output).toContain("import { Injectable } from '@nestjs/common';");

    expect(output).toContain("export type ParamStyle = 'csv' | 'space' | 'pipe' | 'deep';");

    expect(output).toContain('@Injectable()');
    expect(output).toContain('export class RequestBuilder {');

    expect(output).toMatch(
      /public buildUrl\(\s*template: string,\s*pathParams\?: Record<string, unknown>,?\s*\): string \{/,
    );
    expect(output).toMatch(
      /public buildQuery<T extends object, K extends keyof T>\(\s*query: T \| undefined,\s*keys: readonly K\[\],\s*styles\?: Partial<Record<K, ParamStyle>>,?\s*\): Record<string, unknown> \{/,
    );
    expect(output).toMatch(
      /public buildHeaders<T extends object, K extends keyof T>\(\s*base: Record<string, string> \| undefined,\s*extras: T \| undefined,\s*keys: readonly K\[\],?\s*\): Record<string, string> \{/,
    );

    expect(output).toMatch(/private serializeDeep\(/);
    expect(output).toMatch(/private stringifyHeader\(/);
  });

  it('encodes path parameter values and stays permissive on missing keys', async () => {
    const output = (await writer.write('1.0.0', 'X', '1.0.0')).generatedCode;

    expect(output).toContain('let path = template;');
    expect(output).toContain('if (pathParams) {');
    expect(output).toContain('for (const key of Object.keys(pathParams)) {');
    expect(output).toContain('const value = pathParams[key];');

    expect(output).toMatch(
      /value === null \|\| value === undefined[\s\S]*\?\s*''[\s\S]*:\s*encodeURIComponent\(String\(value\)\)/,
    );
    expect(output).toMatch(/path\s*=\s*path\.split\(`\{\$\{key\}\}`\)\.join\(encoded\)/);

    expect(output).toMatch(/const suffix = path\.startsWith\('\/'\) \? path : `\/\$\{path\}`/);
    expect(output).toMatch(/return suffix;/);
  });

  it('applies the four OpenAPI styles in buildQuery with null clear-semantic and undefined omit', async () => {
    const output = (await writer.write('1.0.0', 'X', '1.0.0')).generatedCode;

    expect(output).toContain('const out: Record<string, unknown> = {};');
    expect(output).toContain('if (!query) return out;');
    expect(output).toContain('const source = query as Record<string, unknown>;');
    expect(output).toContain('const styleMap = styles as Record<string, ParamStyle> | undefined;');

    expect(output).toContain('for (const k of keys as readonly string[]) {');

    expect(output).toMatch(/if \(value === undefined\) continue/);
    expect(output).toMatch(
      /if \(value === null\) \{[\s\S]*out\[k\] = '';[\s\S]*continue;[\s\S]*\}/,
    );

    expect(output).toContain('const style = styleMap?.[k];');

    expect(output).toMatch(
      /if \(style === 'csv'\)[\s\S]*Array\.isArray\(value\) \? value\.join\(','\) : value/,
    );
    expect(output).toMatch(/style === 'space'[\s\S]*value\.join\(' '\)/);
    expect(output).toMatch(/style === 'pipe'[\s\S]*value\.join\('\|'\)/);

    expect(output).toMatch(
      /style === 'deep'[\s\S]*typeof value === 'object'[\s\S]*!Array\.isArray\(value\)/,
    );
    expect(output).toMatch(/this\.serializeDeep\(out, k, value as Record<string, unknown>\)/);

    expect(output).toContain('return out;');
  });

  it('composes header maps from a base and per-call extras with stringification', async () => {
    const output = (await writer.write('1.0.0', 'X', '1.0.0')).generatedCode;

    expect(output).toMatch(
      /const out: Record<string, string> = \{\s*\.\.\.\(base \?\? \{\}\)\s*\};/,
    );
    expect(output).toContain('if (!extras) return out;');
    expect(output).toContain('const source = extras as Record<string, unknown>;');
    expect(output).toMatch(/out\[k\] = this\.stringifyHeader\(value\);/);
  });

  it('serializes deepObject sub-fields with name[sub] keys and skips nullish entries', async () => {
    const output = (await writer.write('1.0.0', 'X', '1.0.0')).generatedCode;

    expect(output).toMatch(
      /private serializeDeep\([\s\S]*out: Record<string, unknown>,[\s\S]*name: string,[\s\S]*obj: Record<string, unknown>,?\s*\): void \{/,
    );
    expect(output).toContain('for (const sub of Object.keys(obj)) {');
    expect(output).toContain('const v = obj[sub];');
    expect(output).toMatch(/if \(v === null \|\| v === undefined\) continue;/);

    expect(output).toMatch(/out\[`\$\{name\}\[\$\{sub\}\]`\] = v\.join\(','\)/);
    expect(output).toMatch(/typeof v === 'object'[\s\S]*JSON\.stringify\(v\)/);
    expect(output).toMatch(/out\[`\$\{name\}\[\$\{sub\}\]`\] = String\(v\)/);
  });

  it('stringifies header values respecting arrays, objects and primitives', async () => {
    const output = (await writer.write('1.0.0', 'X', '1.0.0')).generatedCode;

    expect(output).toMatch(/private stringifyHeader\(value: unknown\): string \{/);
    expect(output).toMatch(
      /if \(Array\.isArray\(value\)\) return value\.map\(\(v\) => String\(v\)\)\.join\(','\)/,
    );
    expect(output).toMatch(
      /typeof value === 'object' && value !== null[\s\S]*return JSON\.stringify\(value\)/,
    );
    expect(output).toMatch(/return String\(value\)/);
  });

  it('keeps the file lean: no error throwing, no any, single @Injectable, no service imports', async () => {
    const output = (await writer.write('1.0.0', 'X', '1.0.0')).generatedCode;

    expect(output).not.toMatch(/\bthrow\s+new\s+Error/);
    expect(output).not.toMatch(/:\s*any\b/);

    const injectableCount = output.match(/@Injectable\(\)/g)?.length ?? 0;
    expect(injectableCount).toBe(1);

    expect(output).not.toContain("from '@nestjs/axios'");
    expect(output).not.toContain('HttpService');
    expect(output).not.toContain("from './services/");
    expect(output).not.toContain("from './api.configuration'");
  });
});
