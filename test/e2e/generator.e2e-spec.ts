/**
 * End-to-End Test Suite for nog-cli
 *
 * **Strategy**: in-process invocation of the CLI Program against real-world OpenAPI specs.
 *
 * The CLI is executed by directly calling `new Program({ skipExit: true }).parse(argv)`
 * — no subprocess, no compiled `dist/`. This means:
 *  - tests run against the TypeScript source as-is (no `npm run build` required)
 *  - the Commander wiring is exercised end-to-end (real `commander`, real `GenerateCommand`)
 *  - generated files are inspected with the TypeScript Compiler API to validate
 *    syntactic correctness and structural shape
 *
 * Assertions cover:
 *  - successful end-to-end generation on real fixtures (real-world, complex)
 *  - structural sanity of the produced SDK (NestJS module, services with methods)
 *  - Commander error paths (missing argument, unknown option)
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { Program } from '../../src/cli/program';

const TEMP_DIR = path.resolve('test-output');

const TEST_CASES = [
  {
    name: 'Real World',
    input: 'test/fixtures/cyclos.json',
    output: 'test-output/e2e-real-world',
  },
  {
    name: 'Complex (Edge Cases)',
    input: 'test/fixtures/complex.json',
    output: 'test-output/e2e-complex',
  },
];

const runCli = async (argv: string[]): Promise<void> => {
  const program = new Program({ skipExit: true });
  await program.parse(['node', 'nog-cli', ...argv]);
};

interface ParsedFile {
  filename: string;
  sourceFile: ts.SourceFile;
}

const collectTypeScriptFiles = (outputPath: string): ParsedFile[] => {
  const files: ParsedFile[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const sourceFile = ts.createSourceFile(
        entry.name,
        content,
        ts.ScriptTarget.ES2021,
        /* setParentNodes */ true,
      );
      files.push({ filename: entry.name, sourceFile });
    }
  };

  walk(outputPath);
  return files;
};

const hasClassWithDecorator = (sourceFile: ts.SourceFile, decoratorName: string): boolean => {
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) return;

    if (ts.isClassDeclaration(node)) {
      const decorators = ts.getDecorators(node) ?? [];
      for (const decorator of decorators) {
        const expression = decorator.expression;
        const identifier = ts.isCallExpression(expression) ? expression.expression : expression;
        if (ts.isIdentifier(identifier) && identifier.text === decoratorName) {
          found = true;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
};

const hasMethodDeclaration = (sourceFile: ts.SourceFile): boolean => {
  let found = false;

  const visit = (node: ts.Node): void => {
    if (found) return;

    if (ts.isClassDeclaration(node)) {
      if (node.members.some((member) => ts.isMethodDeclaration(member))) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
};

beforeAll(() => {
  // Only ensure the shared parent exists; do NOT rmSync it. Each it() below
  // and the nested cataas describe already clean their own subdirectory.
  // Wiping the parent here races sibling E2E suites (request-builder-runtime,
  // sdk-compile, api-module-multi-config) that Vitest runs in parallel forks
  // and that write into their own subdirectories under test-output/.
  fs.mkdirSync(TEMP_DIR, { recursive: true });
});

describe('nog-cli generator E2E', () => {
  TEST_CASES.forEach(({ name, input, output }) => {
    it(`should generate a structurally valid SDK for ${name}`, async () => {
      const outputDir = path.resolve(output);
      fs.rmSync(outputDir, { recursive: true, force: true });

      const start = performance.now();
      await runCli(['generate', path.resolve(input), '-o', outputDir]);
      const duration = performance.now() - start;

      console.log(`[${name}] Generation time: ${(duration / 1000).toFixed(2)}s`);
      expect(duration).toBeLessThan(30000);

      const files = collectTypeScriptFiles(outputDir);

      const moduleFile = files.find((file) => file.filename === 'api.module.ts');
      expect(moduleFile).toBeDefined();
      expect(hasClassWithDecorator(moduleFile!.sourceFile, 'Module')).toBe(true);

      // Config providers are declared directly on the module — no sub-module dance.
      expect(moduleFile!.sourceFile.text).toMatch(
        /exports:\s*\[\s*API_CONFIG,\s*ApiConfiguration,\s*RequestBuilder,\s*HttpModule,/,
      );
      expect(moduleFile!.sourceFile.text).toMatch(/paramsSerializer:\s*\{\s*indexes:\s*null\s*\}/);
      expect(moduleFile!.sourceFile.text).toMatch(
        /static forRootAsync\(options: ApiModuleAsyncConfig\): DynamicModule/,
      );
      expect(moduleFile!.sourceFile.text).toContain('HttpModule.register({');
      expect(moduleFile!.sourceFile.text).toContain('HttpModule.registerAsync({');

      // forRootAsync builds asyncProviders once and shares the same reference between
      // module.providers and HttpModule.registerAsync({ extraProviders }).
      expect(moduleFile!.sourceFile.text).toMatch(
        /const asyncProviders\s*=\s*createAsyncProviders\(options\)/,
      );
      expect(moduleFile!.sourceFile.text).toMatch(/extraProviders:\s*asyncProviders/);
      expect(moduleFile!.sourceFile.text).toMatch(
        /providers:\s*\[\s*ApiConfiguration,\s*RequestBuilder,\s*\.\.\.asyncProviders/,
      );

      // The helper function lives alongside the class.
      expect(moduleFile!.sourceFile.text).toContain(
        'function createAsyncProviders(options: ApiModuleAsyncConfig): Provider[]',
      );

      // Direct imports of the configuration providers — declared inline on the module.
      expect(moduleFile!.sourceFile.text).toContain(
        "import { ApiConfiguration } from './api.configuration';",
      );
      expect(moduleFile!.sourceFile.text).toContain(
        "import { RequestBuilder } from './request-builder.service';",
      );

      const typesFile = files.find((file) => file.filename === 'api.types.ts');
      expect(typesFile).toBeDefined();
      expect(typesFile!.sourceFile.text).toMatch(
        /export interface ApiModuleAsyncConfig\s+extends Pick<ModuleMetadata, 'imports'>/,
      );
      expect(typesFile!.sourceFile.text).toMatch(
        /useFactory\?:\s*\(\s*\.\.\.args:\s*any\[\]\s*\)\s*=>/,
      );
      expect(typesFile!.sourceFile.text).toMatch(/inject\?:\s*any\[\];/);

      const serviceFiles = files.filter(
        (file) =>
          file.filename.toLowerCase().endsWith('.service.ts') &&
          file.filename !== 'request-builder.service.ts',
      );
      expect(serviceFiles.length).toBeGreaterThan(0);

      const hasServiceMethods = serviceFiles.some((file) => hasMethodDeclaration(file.sourceFile));
      expect(hasServiceMethods).toBe(true);

      const configFile = files.find((file) => file.filename === 'api.configuration.ts');
      expect(configFile).toBeDefined();
      expect(configFile!.sourceFile.text).toMatch(/get baseUrl\(\): string \{/);
      expect(configFile!.sourceFile.text).toMatch(/get headers\(\): ApiHeaders \{/);
      expect(configFile!.sourceFile.text).toMatch(/get httpOptions\(\): AxiosRequestConfig \{/);

      const requestBuilderFile = files.find(
        (file) => file.filename === 'request-builder.service.ts',
      );
      expect(requestBuilderFile).toBeDefined();
      expect(hasClassWithDecorator(requestBuilderFile!.sourceFile, 'Injectable')).toBe(true);
      expect(requestBuilderFile!.sourceFile.text).toContain('export class RequestBuilder {');
      expect(requestBuilderFile!.sourceFile.text).toContain('public buildUrl(');
      expect(requestBuilderFile!.sourceFile.text).toContain('public buildQuery<');
      expect(requestBuilderFile!.sourceFile.text).toContain('public buildHeaders<');
      expect(requestBuilderFile!.sourceFile.text).toContain(
        "export type ParamStyle = 'csv' | 'space' | 'pipe' | 'deep';",
      );

      for (const serviceFile of serviceFiles) {
        expect(serviceFile.sourceFile.text).toContain('private readonly rb: RequestBuilder');
        expect(serviceFile.sourceFile.text).toContain('this.rb.buildUrl(');
      }
      const someServiceCallsBuildQuery = serviceFiles.some((file) =>
        file.sourceFile.text.includes('this.rb.buildQuery('),
      );
      expect(someServiceCallsBuildQuery).toBe(true);

      const multipartService = serviceFiles.find((file) =>
        file.sourceFile.text.includes("headers['Content-Type'] = 'multipart/form-data'"),
      );
      expect(multipartService).toBeDefined();

      const phoneViewFile = files.find((file) => file.filename === 'phone-view.dto.ts');
      if (phoneViewFile) {
        for (const prop of ['name', 'number', 'extension', 'hidden', 'enabledForSms', 'verified']) {
          expect(phoneViewFile.sourceFile.text).toMatch(new RegExp(`declare public ${prop}\\??:`));
        }
        expect(phoneViewFile.sourceFile.text).toMatch(/\n {2}public user\??:/);
        expect(phoneViewFile.sourceFile.text).toMatch(/\n {2}public canEdit\??:/);
      }

      const phoneFile = files.find((file) => file.filename === 'phone.dto.ts');
      if (phoneFile) {
        expect(phoneFile.sourceFile.text).toMatch(/declare public name\??:/);
      }
    });
  });

  describe('Type safety on anonymous schemas (Finding 4 regression guards)', () => {
    const cataasOutput = 'test-output/e2e-cataas';

    beforeAll(async () => {
      fs.rmSync(path.resolve(cataasOutput), { recursive: true, force: true });
      await runCli(['generate', path.resolve('test/fixtures/cataas.json'), '-o', cataasOutput]);
    });

    it('emits string-literal unions for inline string enums (no `any | any` fallback)', () => {
      const catsServicePath = path.join(cataasOutput, 'services', 'cats.service.ts');
      const text = fs.readFileSync(catsServicePath, 'utf-8');

      expect(text).toContain("'square' | 'medium' | 'small' | 'xsmall'");
      expect(text).toContain("'mono' | 'negate' | 'custom'");
      expect(text).toContain("'cover' | 'contain' | 'fill' | 'inside' | 'outside'");
    });

    it('emits inline TS type literal for anonymous object responses (no `any` fallback)', () => {
      const apiServicePath = path.join(cataasOutput, 'services', 'api.service.ts');
      const text = fs.readFileSync(apiServicePath, 'utf-8');

      expect(text).toContain('Observable<AxiosResponse<{ count?: number }>>');
    });
  });

  describe('Commander integration', () => {
    it('should reject an unknown option with a non-zero exit', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        await runCli([
          'generate',
          path.resolve('test/fixtures/cyclos.json'),
          '--definitely-not-an-option',
        ]).catch(() => undefined);

        expect(exitSpy).toHaveBeenCalled();
        const exitCode = exitSpy.mock.calls[0]?.[0];
        expect(exitCode).not.toBe(0);
      } finally {
        exitSpy.mockRestore();
        stderrSpy.mockRestore();
      }
    });

    it('should reject a missing required argument with a non-zero exit', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        // 'generate' requires <openapiFile> — invoking without it must error.
        await runCli(['generate']).catch(() => undefined);

        expect(exitSpy).toHaveBeenCalled();
        const exitCode = exitSpy.mock.calls[0]?.[0];
        expect(exitCode).not.toBe(0);
      } finally {
        exitSpy.mockRestore();
        stderrSpy.mockRestore();
      }
    });
  });
});
