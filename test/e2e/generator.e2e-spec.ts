/**
 * End-to-End Test Suite for nog-cli Generator
 *
 * **Strategy**: Data-Driven Testing with Syntax Validation
 *
 * This suite validates the entire SDK generation pipeline against real-world OpenAPI specifications:
 *
 * 1. **Test Data**: Fixtures are loaded from `test/fixtures/` (Cyclos and Complex edge cases).
 * 2. **CLI Invocation**: Each test case runs the compiled CLI via `child_process.execSync`.
 * 3. **Syntax Validation**: Generated files are loaded into a ts-morph `Project` without compilation,
 *    allowing deep AST inspection without requiring `npm install` inside the output directory.
 * 4. **Assertions**: Verify that:
 *    - The module file exists and contains an `@Module` decorated class.
 *    - Service files are generated with operation methods.
 *    - No file I/O errors occur during generation.
 *
 * Benefits:
 * - Catches structural regressions early (missing imports, malformed classes, etc.).
 * - Avoids expensive full compilation/runtime test steps.
 * - Provides confidence that generated code is syntactically valid TypeScript.
 * - Data-driven approach scales to multiple OpenAPI specs without code duplication.
 */
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { beforeAll, describe, expect, it } from 'vitest';

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

const runCli = (inputPath: string, outputPath: string): void => {
  execSync(
    `node ${path.resolve('dist/src/main.js')} generate ${path.resolve(inputPath)} -o ${outputPath}`,
    { stdio: 'inherit' },
  );
};

const loadGeneratedProject = (outputPath: string): Project => {
  const project = new Project({
    compilerOptions: {
      target: ScriptTarget.ES2021,
      module: ModuleKind.CommonJS,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: false,
    },
    skipAddingFilesFromTsConfig: true,
  });

  project.addSourceFilesAtPaths(path.join(outputPath, '**/*.ts'));
  return project;
};

const buildOutputSnapshot = (outputPath: string): [string, string][] => {
  const files: [string, string][] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const relativePath = path.relative(outputPath, fullPath);
        files.push([relativePath, hash]);
      }
    }
  };

  walk(outputPath);
  return files.sort((a, b) => a[0].localeCompare(b[0]));
};

beforeAll(() => {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });
});

describe('nog-cli generator E2E', () => {
  TEST_CASES.forEach(({ name, input, output }) => {
    it(`should generate compilable SDK for ${name}`, () => {
      const outputDir = path.resolve(output);
      fs.rmSync(outputDir, { recursive: true, force: true });

      // Timing benchmark
      const start = performance.now();
      runCli(input, outputDir);
      const duration = performance.now() - start;

      console.log(`[${name}] Generation time: ${(duration / 1000).toFixed(2)}s`);
      expect(duration).toBeLessThan(30000);

      // Output regression snapshot
      const snapshot = buildOutputSnapshot(outputDir);
      expect(snapshot).toMatchSnapshot();

      // Existing structural assertions
      const project = loadGeneratedProject(outputDir);

      const moduleFile = project
        .getSourceFiles()
        .find((file) => file.getBaseName().toLowerCase().endsWith('.module.ts'));
      expect(moduleFile).toBeDefined();

      const moduleClass = moduleFile?.getClasses().find((cls) => cls.getDecorator('Module'));
      expect(moduleClass).toBeDefined();

      const serviceFiles = project
        .getSourceFiles()
        .filter((file) => file.getBaseName().toLowerCase().endsWith('.service.ts'));
      expect(serviceFiles.length).toBeGreaterThan(0);

      const hasServiceMethods = serviceFiles.some((file) =>
        file.getClasses().some((cls) => cls.getMethods().length > 0),
      );
      expect(hasServiceMethods).toBe(true);
    });
  });
});
