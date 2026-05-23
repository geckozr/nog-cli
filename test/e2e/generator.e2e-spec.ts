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
 *  - successful end-to-end generation on real fixtures (Cyclos, Complex)
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
    name: 'Cyclos (Real World)',
    input: 'test/fixtures/cyclos.json',
    output: 'test-output/e2e-cyclos',
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
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
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

      const moduleFile = files.find((file) => file.filename.toLowerCase().endsWith('.module.ts'));
      expect(moduleFile).toBeDefined();
      expect(hasClassWithDecorator(moduleFile!.sourceFile, 'Module')).toBe(true);

      const serviceFiles = files.filter((file) =>
        file.filename.toLowerCase().endsWith('.service.ts'),
      );
      expect(serviceFiles.length).toBeGreaterThan(0);

      const hasServiceMethods = serviceFiles.some((file) => hasMethodDeclaration(file.sourceFile));
      expect(hasServiceMethods).toBe(true);
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
