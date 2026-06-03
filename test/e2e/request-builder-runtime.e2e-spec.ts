/**
 * Runtime semantics suite for the generated `request-builder.service.ts`.
 *
 * Sibling specs check AST shape (unit) and compile-cleanly (sdk-compile);
 * neither *runs* the emitted code. This suite generates the file via the
 * writer, strips the `@nestjs/common` dependency (the CLI repo does not
 * depend on NestJS — see test/fixtures/typestubs/sdk-deps.d.ts), transpiles
 * to ESM, dynamically imports it, and exercises the three public methods on
 * concrete inputs. The result is a real-world guarantee that the emitted
 * code behaves per OpenAPI 3 spec.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { pathToFileURL } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../src/core/generator/writers/core/ast-printer';
import { DecoratorBuilder } from '../../src/core/generator/writers/core/decorator-builder';
import { HeaderGenerator } from '../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../src/core/generator/writers/core/import-builder';
import { TypeBuilder } from '../../src/core/generator/writers/core/type-builder';
import { RequestBuilderWriter } from '../../src/core/generator/writers/request-builder.writer';

interface RuntimeRequestBuilder {
  buildUrl(template: string, pathParams?: Record<string, unknown>): string;
  buildQuery<T extends object>(
    query: T | undefined,
    keys: readonly (keyof T)[],
    styles?: Partial<Record<keyof T, 'csv' | 'space' | 'pipe' | 'deep'>>,
  ): Record<string, unknown>;
  buildHeaders<T extends object>(
    base: Record<string, string> | undefined,
    extras: T | undefined,
    keys: readonly (keyof T)[],
  ): Record<string, string>;
}

let rb: RuntimeRequestBuilder;

beforeAll(async () => {
  const writer = new RequestBuilderWriter(
    new AstPrinter(),
    new HeaderGenerator(),
    new ImportBuilder(),
    new TypeBuilder(),
    new DecoratorBuilder(),
  );
  const file = await writer.write('runtime', 'RuntimeSuite', '1.0.0');

  // The generated file imports @nestjs/common, which nog-cli does not depend on.
  // Replace the import with a local no-op decorator so the transpiled module is
  // self-contained at runtime.
  const stripped = file.generatedCode
    .replace(
      /import \{ Injectable \} from '@nestjs\/common';\s*/,
      'function Injectable() { return () => undefined; }\n',
    )
    .replace(/@Injectable\(\)\s*\n/, '');

  const { outputText } = ts.transpileModule(stripped, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  });

  const outDir = path.resolve('test-output/request-builder-runtime');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'request-builder.mjs');
  writeFileSync(outPath, outputText);

  const mod = (await import(pathToFileURL(outPath).href)) as {
    RequestBuilder: new () => RuntimeRequestBuilder;
  };
  rb = new mod.RequestBuilder();
});

describe('RequestBuilder.buildUrl', () => {
  it('encodes path-parameter values per RFC 3986', () => {
    expect(rb.buildUrl('/a/{b}/c', { b: 'foo/bar' })).toBe('/a/foo%2Fbar/c');
    expect(rb.buildUrl('/q/{q}', { q: 'spaces & symbols?!' })).toBe(
      '/q/spaces%20%26%20symbols%3F!',
    );
  });

  it('leaves placeholders untouched when the key is missing from pathParams', () => {
    expect(rb.buildUrl('/a/{b}/c', {})).toBe('/a/{b}/c');
  });

  it('treats null and undefined path values as empty strings', () => {
    expect(rb.buildUrl('/a/{b}/c', { b: null })).toBe('/a//c');
    expect(rb.buildUrl('/a/{b}/c', { b: undefined })).toBe('/a//c');
  });

  it('normalises a missing leading slash on the template', () => {
    expect(rb.buildUrl('a', undefined)).toBe('/a');
    expect(rb.buildUrl('a')).toBe('/a');
  });
});

describe('RequestBuilder.buildQuery', () => {
  it('returns an empty object for undefined query', () => {
    expect(rb.buildQuery<{ x: string }>(undefined, ['x'] as const)).toEqual({});
  });

  it('omits undefined values (do-not-touch semantic)', () => {
    expect(rb.buildQuery({ x: undefined } as { x?: string }, ['x'] as const)).toEqual({});
  });

  it('emits an empty string for null values (clear-semantic, wipe-a-field pattern)', () => {
    expect(rb.buildQuery({ x: null } as unknown as { x: string }, ['x'] as const)).toEqual({
      x: '',
    });
  });

  it('preserves falsy-but-defined values like 0 and false', () => {
    expect(rb.buildQuery({ x: 0 } as { x: number }, ['x'] as const)).toEqual({ x: 0 });
    expect(rb.buildQuery({ x: false } as { x: boolean }, ['x'] as const)).toEqual({ x: false });
  });

  it('serializes arrays with OpenAPI form+explode:false (csv) style', () => {
    expect(rb.buildQuery({ fields: ['a', 'b'] }, ['fields'] as const, { fields: 'csv' })).toEqual({
      fields: 'a,b',
    });
  });

  it('serializes arrays with pipeDelimited style', () => {
    expect(rb.buildQuery({ tags: ['x', 'y'] }, ['tags'] as const, { tags: 'pipe' })).toEqual({
      tags: 'x|y',
    });
  });

  it('serializes arrays with spaceDelimited style', () => {
    expect(rb.buildQuery({ tags: ['x', 'y'] }, ['tags'] as const, { tags: 'space' })).toEqual({
      tags: 'x y',
    });
  });

  it('expands deepObject style into key[sub]=value entries', () => {
    expect(
      rb.buildQuery({ filter: { name: 'x', age: 3 } }, ['filter'] as const, {
        filter: 'deep',
      }),
    ).toEqual({ 'filter[name]': 'x', 'filter[age]': '3' });
  });

  it('skips null/undefined sub-values in deepObject', () => {
    expect(
      rb.buildQuery(
        { filter: { name: 'x', age: null } } as { filter: object },
        ['filter'] as const,
        {
          filter: 'deep',
        },
      ),
    ).toEqual({ 'filter[name]': 'x' });
  });

  it('joins nested arrays in deepObject sub-fields with commas', () => {
    expect(
      rb.buildQuery({ filter: { tags: ['a', 'b'] } }, ['filter'] as const, { filter: 'deep' }),
    ).toEqual({ 'filter[tags]': 'a,b' });
  });

  it('does not leak keys outside the whitelist', () => {
    expect(rb.buildQuery({ a: 1, b: 2 } as { a: number; b: number }, ['a'] as const)).toEqual({
      a: 1,
    });
  });
});

describe('RequestBuilder.buildHeaders', () => {
  it('merges base headers with per-call extras', () => {
    expect(rb.buildHeaders({ 'X-Base': 'b' }, { pin: '123' }, ['pin'] as const)).toEqual({
      'X-Base': 'b',
      pin: '123',
    });
  });

  it('emits an empty string for null extras (clear-semantic)', () => {
    expect(
      rb.buildHeaders(undefined, { pin: null } as unknown as { pin: string }, ['pin'] as const),
    ).toEqual({ pin: '' });
  });

  it('omits extras whose value is undefined', () => {
    expect(
      rb.buildHeaders(undefined, { pin: undefined } as { pin?: string }, ['pin'] as const),
    ).toEqual({});
  });

  it('lets extras override base headers for the same key', () => {
    expect(rb.buildHeaders({ A: '1' }, { A: '2' }, ['A'] as const)).toEqual({ A: '2' });
  });

  it('coerces primitive values to strings', () => {
    expect(rb.buildHeaders(undefined, { ttl: 10 } as { ttl: number }, ['ttl'] as const)).toEqual({
      ttl: '10',
    });
  });

  it('joins array values with commas', () => {
    expect(
      rb.buildHeaders(undefined, { acc: ['json', 'xml'] } as { acc: string[] }, ['acc'] as const),
    ).toEqual({ acc: 'json,xml' });
  });
});
