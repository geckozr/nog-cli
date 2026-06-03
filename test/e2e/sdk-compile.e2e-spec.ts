/**
 * Compile-check E2E suite for the generated SDK.
 *
 * The sibling `generator.e2e-spec.ts` parses emitted files with
 * `ts.createSourceFile` and asserts on AST shape only — it never type-checks,
 * so semantic errors that would block a real consumer (`TS2351`, `TS2322`,
 * `TS2612`, …) can pass the AST suite while failing under `tsc --strict`.
 *
 * This suite runs `ts.createProgram` over the generated output under the
 * compiler flags a consumer would actually use (target es2022, strict,
 * useDefineForClassFields, experimentalDecorators) and asserts zero semantic
 * diagnostics. External runtime dependencies (NestJS, axios, …) are satisfied
 * by ambient stubs in `test/fixtures/typestubs/sdk-deps.d.ts` — nog-cli does
 * not depend on them itself, so we avoid installing them just to type-check.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import { Program } from '../../src/cli/program';

const TEMP_DIR = path.resolve('test-output');
const STUB_FILE = path.resolve('test/fixtures/typestubs/sdk-deps.d.ts');

const CONSUMER_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.Node16,
  moduleResolution: ts.ModuleResolutionKind.Node16,
  strict: true,
  noImplicitAny: true,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  useDefineForClassFields: true,
  forceConsistentCasingInFileNames: true,
  types: ['node'],
};

const TEST_CASES = [
  {
    name: 'Real World',
    input: 'test/fixtures/cyclos.json',
    output: 'test-output/compile-real-world',
  },
  {
    name: 'Complex (Edge Cases)',
    input: 'test/fixtures/complex.json',
    output: 'test-output/compile-complex',
  },
];

const runCli = async (argv: string[]): Promise<void> => {
  const program = new Program({ skipExit: true });
  await program.parse(['node', 'nog-cli', ...argv]);
};

const collectTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
  };
  walk(dir);
  return out;
};

interface FormattedDiagnostic {
  code: number;
  file: string;
  line: number;
  column: number;
  message: string;
}

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]): FormattedDiagnostic[] => {
  return diagnostics.map((d) => {
    const file = d.file ? path.relative(process.cwd(), d.file.fileName) : '<unknown>';
    let line = 0;
    let column = 0;
    if (d.file && d.start !== undefined) {
      const pos = d.file.getLineAndCharacterOfPosition(d.start);
      line = pos.line + 1;
      column = pos.character + 1;
    }
    return {
      code: d.code,
      file,
      line,
      column,
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    };
  });
};

beforeAll(() => {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
});

describe('generated SDK compile-check', () => {
  TEST_CASES.forEach(({ name, input, output }) => {
    it(`should type-check cleanly under strict consumer flags: ${name}`, async () => {
      const outputDir = path.resolve(output);
      fs.rmSync(outputDir, { recursive: true, force: true });

      await runCli(['generate', path.resolve(input), '-o', outputDir]);

      const rootFiles = [STUB_FILE, ...collectTsFiles(outputDir)];
      const program = ts.createProgram(rootFiles, CONSUMER_COMPILER_OPTIONS);

      const errors = ts
        .getPreEmitDiagnostics(program)
        .filter((d) => d.category === ts.DiagnosticCategory.Error);

      if (errors.length > 0) {
        const formatted = formatDiagnostics(errors);
        const summary = formatted
          .slice(0, 30)
          .map((d) => `  TS${d.code} ${d.file}:${d.line}:${d.column}  ${d.message}`)
          .join('\n');
        const overflow = formatted.length > 30 ? `\n  ... and ${formatted.length - 30} more` : '';
        console.error(
          `\n[${name}] ${errors.length} semantic error(s) in generated SDK:\n${summary}${overflow}\n`,
        );
      }

      expect(errors.map((d) => `TS${d.code}`)).toEqual([]);
    }, 60_000);
  });
});
