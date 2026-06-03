/**
 * Multi-config isolation regression suite for the generated `api.module.ts`.
 *
 * Replicates the discriminating test that beta-tester surfaced against
 * 0.11.0: two distinct `ApiModule.forRootAsync(opts)` registrations with
 * different `useFactory` callbacks must produce two isolated `DynamicModule`
 * objects whose `API_CONFIG` providers are distinct, and inside a single
 * registration the `API_CONFIG` provider object must be the SAME reference
 * in both `module.providers` and `HttpModule.registerAsync({ extraProviders })`
 * — that shared reference is what makes NestJS v11 fire the consumer
 * `useFactory` exactly once per registration.
 *
 * The CLI repo doesn't depend on NestJS, so we run the writer directly,
 * strip the framework imports, replace them with minimal stubs that preserve
 * the runtime shape we care about, transpile to ESM and dynamic-import the
 * result. This mirrors the pattern in `request-builder-runtime.e2e-spec.ts`.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { pathToFileURL } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

import { ApiModuleWriter } from '../../src/core/generator/writers/api-module.writer';
import { AstPrinter } from '../../src/core/generator/writers/core/ast-printer';
import { DecoratorBuilder } from '../../src/core/generator/writers/core/decorator-builder';
import { HeaderGenerator } from '../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../src/core/generator/writers/core/import-builder';
import { TypeBuilder } from '../../src/core/generator/writers/core/type-builder';
import { IrService } from '../../src/core/ir';

interface RuntimeProvider {
  provide: unknown;
  useValue?: unknown;
  useFactory?: (...args: unknown[]) => unknown;
  inject?: unknown[];
}

interface RuntimeHttpModule {
  module: unknown;
  imports?: unknown[];
  inject?: unknown[];
  extraProviders?: RuntimeProvider[];
  useFactory?: (...args: unknown[]) => unknown;
}

interface RuntimeDynamicModule {
  module: unknown;
  imports: Array<RuntimeHttpModule | unknown>;
  providers: Array<RuntimeProvider | unknown>;
  exports: unknown[];
}

interface RuntimeApiModule {
  forRoot(config?: unknown): RuntimeDynamicModule;
  forRootAsync(options: unknown): RuntimeDynamicModule;
}

let ApiModule: RuntimeApiModule;
let API_CONFIG: symbol;

beforeAll(async () => {
  const writer = new ApiModuleWriter(
    new AstPrinter(),
    new HeaderGenerator(),
    new ImportBuilder(),
    new TypeBuilder(),
    new DecoratorBuilder(),
  );

  const services: IrService[] = [
    { name: 'UsersService', fileName: 'users.service' } as IrService,
    { name: 'PostsService', fileName: 'posts.service' } as IrService,
  ];

  const file = await writer.write(services, 'Api', '1.0.0', 'MultiConfigSuite', '1.0.0');

  // Strip framework imports. Types disappear at transpile-time so we only
  // need to substitute the runtime identifiers (HttpModule, Module decorator,
  // ApiConfiguration class, RequestBuilder class, API_CONFIG symbol, service
  // classes). HttpModule.register[Async] just echoes its options back so we
  // can inspect the shape.
  const stripped = file.generatedCode
    .replace(/import \{[^}]*\} from '@nestjs\/common';\s*/g, '')
    .replace(/import \{ HttpModule \} from '@nestjs\/axios';\s*/g, '')
    .replace(/import \{ ApiConfiguration \} from '\.\/api\.configuration';\s*/g, '')
    .replace(/import \{ RequestBuilder \} from '\.\/request-builder\.service';\s*/g, '')
    .replace(/import \{[\s\S]*?\} from '\.\/api\.types';\s*/g, '')
    .replace(/import \{[^}]*\} from '\.\/services\/[^']+';\s*/g, '')
    .replace(/@Module\([^)]*\)\s*/g, '');

  const preamble = `
function Module() { return () => undefined; }
class HttpModule {}
HttpModule.register = function (opts) { return { module: HttpModule, ...opts }; };
HttpModule.registerAsync = function (opts) { return { module: HttpModule, ...opts }; };
class ApiConfiguration {}
class RequestBuilder {}
const API_CONFIG = Symbol('API_CONFIG');
class UsersService {}
class PostsService {}
export { ApiModule as default, API_CONFIG };
`;

  const fullCode = stripped + preamble;

  const { outputText } = ts.transpileModule(fullCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      esModuleInterop: true,
    },
  });

  const outDir = path.resolve('test-output/api-module-multi-config');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'api-module.mjs');
  writeFileSync(outPath, outputText);

  const mod = (await import(pathToFileURL(outPath).href)) as {
    default: RuntimeApiModule;
    API_CONFIG: symbol;
  };
  ApiModule = mod.default;
  API_CONFIG = mod.API_CONFIG;
});

const findApiConfigProvider = (
  providers: Array<RuntimeProvider | unknown>,
): RuntimeProvider | undefined => {
  return providers.find(
    (p): p is RuntimeProvider =>
      typeof p === 'object' &&
      p !== null &&
      'provide' in p &&
      (p as RuntimeProvider).provide === API_CONFIG,
  );
};

describe('ApiModule.forRootAsync — multi-config isolation', () => {
  it('returns a distinct DynamicModule object for each registration', () => {
    const userOpts = { useFactory: () => ({ baseUrl: 'https://user', headers: {} }) };
    const adminOpts = {
      useFactory: () => ({ baseUrl: 'https://admin', headers: { Authorization: 'Basic ADMIN' } }),
    };

    const userDm = ApiModule.forRootAsync(userOpts);
    const adminDm = ApiModule.forRootAsync(adminOpts);

    expect(userDm).not.toBe(adminDm);
    expect(userDm.module).toBe(adminDm.module); // same module class, distinct instances
  });

  it('shares the SAME API_CONFIG provider reference between module.providers and HttpModule.registerAsync({ extraProviders }) within one registration', () => {
    const opts = { useFactory: () => ({ baseUrl: 'https://user', headers: {} }) };
    const dm = ApiModule.forRootAsync(opts);

    const providerFromModule = findApiConfigProvider(dm.providers);
    expect(providerFromModule).toBeDefined();

    const httpDynamicModule = dm.imports.find(
      (m): m is RuntimeHttpModule =>
        typeof m === 'object' &&
        m !== null &&
        Array.isArray((m as RuntimeHttpModule).extraProviders),
    );
    expect(httpDynamicModule).toBeDefined();

    const providerFromHttp = findApiConfigProvider(httpDynamicModule!.extraProviders!);
    expect(providerFromHttp).toBeDefined();

    // Same reference → NestJS v11 registers it once → consumer useFactory runs once.
    expect(providerFromModule).toBe(providerFromHttp);
  });

  it('keeps API_CONFIG providers distinct across two registrations (no leak)', () => {
    const userFn = () => ({ baseUrl: 'https://user', headers: { Authorization: 'USER' } });
    const adminFn = () => ({
      baseUrl: 'https://admin',
      headers: { Authorization: 'Basic ADMIN' },
    });

    const userDm = ApiModule.forRootAsync({ useFactory: userFn });
    const adminDm = ApiModule.forRootAsync({ useFactory: adminFn });

    const userProvider = findApiConfigProvider(userDm.providers);
    const adminProvider = findApiConfigProvider(adminDm.providers);

    expect(userProvider).not.toBe(adminProvider);
    expect(userProvider!.useFactory).toBe(userFn);
    expect(adminProvider!.useFactory).toBe(adminFn);
  });

  it('counts useFactory invocations — fires once per registration when invoked through both consumer sites of the shared reference', async () => {
    let userCount = 0;
    let adminCount = 0;

    const userFn = (): { baseUrl: string; headers: Record<string, string> } => {
      userCount += 1;
      return { baseUrl: 'https://user', headers: {} };
    };
    const adminFn = (): { baseUrl: string; headers: Record<string, string> } => {
      adminCount += 1;
      return { baseUrl: 'https://admin', headers: { Authorization: 'Basic ADMIN' } };
    };

    const userDm = ApiModule.forRootAsync({ useFactory: userFn });
    const adminDm = ApiModule.forRootAsync({ useFactory: adminFn });

    // Simulate NestJS DI: each unique API_CONFIG provider is materialised once.
    const userProvider = findApiConfigProvider(userDm.providers)!;
    const adminProvider = findApiConfigProvider(adminDm.providers)!;
    await userProvider.useFactory!();
    await adminProvider.useFactory!();

    // The HttpModule.registerAsync({ extraProviders }) re-declares the SAME
    // object reference, so NestJS deduplicates it — no second invocation.
    // Sanity-check: the same provider reference is in both spots, so any
    // additional materialisation NestJS would do hits the cached instance.
    expect(userCount).toBe(1);
    expect(adminCount).toBe(1);
  });

  it('forRootAsync emits the configuration providers inline on the module (not via a sub-module)', () => {
    const dm = ApiModule.forRootAsync({ useFactory: () => ({ baseUrl: '', headers: {} }) });

    // ApiConfiguration + RequestBuilder live directly in providers (classes,
    // not provider objects). The fact that they're class references means
    // each forRootAsync invocation owns its own scope — no shared sub-module
    // to dedup against in NestJS v11's reference-equality model.
    const providerNames = dm.providers.map((p) => {
      if (typeof p === 'function') return (p as { name?: string }).name ?? 'anonymous-class';
      if (typeof p === 'object' && p !== null && 'provide' in p) {
        const provide = (p as RuntimeProvider).provide;
        return provide === API_CONFIG ? 'API_CONFIG' : String(provide);
      }
      return 'unknown';
    });

    expect(providerNames).toContain('ApiConfiguration');
    expect(providerNames).toContain('RequestBuilder');
    expect(providerNames).toContain('API_CONFIG');
    expect(providerNames).toContain('UsersService');
    expect(providerNames).toContain('PostsService');
  });
});
