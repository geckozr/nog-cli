# Contributing to nog-cli

Thank you for considering contributing to `nog-cli`. This guide outlines development workflows, testing requirements, and code standards.

## Prerequisites

- **Node.js**: Version 18 or higher.
- **Package Manager**: `npm` version 9 or higher (or `pnpm`).
- **Git**: For cloning and pushing changes.

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/geckozr/nog-cli.git
cd nog-cli
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Enable Git Hooks (once per clone)

Set the hooks path so Husky hooks run locally:

```bash
git config core.hooksPath .husky
```

Hooks in place:

- **pre-commit**: runs `npx lint-staged` (ESLint + Prettier on staged files).
- **commit-msg**: runs `npx --no -- commitlint --edit "$1"` (Conventional Commits).

### 3. Verify Setup

```bash
npm run build
npm test
npm run lint
```

All commands should complete without errors.

## Development Workflow

### Build

Compile TypeScript and generate TypeDoc documentation:

```bash
npm run build
```

Output is written to `dist/` and `docs/`.

### Test

Run the test suite (Vitest):

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Generate coverage report:

```bash
npm run test:coverage
```

**Coverage Requirement:** Greater than 90% line coverage. Pull requests must maintain or improve coverage.

### Lint

Check code for ESLint violations:

```bash
npm run lint
```

Automatically fix violations:

```bash
npm run lint:fix
```

### Format

Format code using Prettier:

```bash
npm run format
```

## Code Standards

### Strict TypeScript

- **Compiler Option**: `strict: true` (enforced in `tsconfig.json`).
- **No `any` Types**: Use `unknown` with type guards if necessary.
- **Explicit Return Types**: Methods and functions must declare return types.

Example:

```typescript
// Good
function processData(input: unknown): string {
  if (typeof input !== 'string') {
    throw new Error('Expected string');
  }
  return input.toUpperCase();
}

// Bad
function processData(input: any): any {
  return input.toUpperCase();
}
```

### Logging

Use the provided Logger utility instead of `console.log()`:

```typescript
import { Logger } from '../../utils/logger';

Logger.info('Processing file:', filePath);
Logger.warn('Deprecation notice:', message);
Logger.error('Failed to parse:', error);
```

### Error Handling

Never use empty `catch` blocks. Always log or re-throw:

```typescript
// Good
try {
  await parser.parse(file);
} catch (error) {
  Logger.error('Parsing failed:', error);
  throw new Error('Invalid OpenAPI document');
}

// Bad
try {
  await parser.parse(file);
} catch (error) {
  // Silently ignore? No.
}
```

### Clean Code Principles

- **Single Responsibility**: Each function should have one reason to change.
- **Explicit Names**: Use descriptive variable names. Avoid abbreviations.
- **Small Functions**: Prefer functions under 30 lines. Extract complex logic into helpers.
- **No Magic Numbers**: Use named constants.

Example:

```typescript
// Good
const TIMEOUT_MS = 20000;
const isTimedOut = elapsedTime > TIMEOUT_MS;

// Avoid
const isTimedOut = elapsedTime > 20000;
```

### Documentation

Use JSDoc for exported classes, methods, and interfaces:

```typescript
/**
 * Parses and validates an OpenAPI specification.
 *
 * Resolves external references and ensures version compatibility.
 *
 * @param input - Path to the OpenAPI file or HTTP URL.
 * @returns Promise resolving to a validated OpenAPI document.
 * @throws Error if the file is invalid or version is unsupported.
 */
export async function parse(input: string): Promise<OpenApiDocument> {
  // Implementation
}
```

Focus on _why_ the code exists, not _what_ it does. Avoid obvious comments:

```typescript
// Good: Explains architectural decision
// Two-pass algorithm resolves circular dependencies without deep recursion
this.initializeModels(); // Pass 1: Create empty model shells
this.populateModels(); // Pass 2: Populate properties

// Bad: Redundant
this.initializeModels(); // Initialize models
this.populateModels(); // Populate models
```

### Naming Conventions

- **Classes**: PascalCase (e.g., `DtoWriter`, `OpenApiParser`)
- **Files**: kebab-case (e.g., `dto.writer.ts`, `openapi.parser.ts`)
- **Methods/Properties**: camelCase (e.g., `writeDto()`, `specTitle`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `TIMEOUT_MS`, `DEFAULT_OUTPUT_DIR`)

### No Debug Code

The codebase must be clean before commit:

- No commented-out code.
- No `TODO` comments without context or GitHub issue reference.
- No `console.log()`, `debugger`, or `console.error()` in feature code.

## Architecture Compliance

Read [DOCUMENTATION.md](DOCUMENTATION.md) to understand the three-stage compiler architecture:

1. **Parser** (`src/core/parser/`): Load and validate OpenAPI.
2. **IR** (`src/core/ir/`): Normalize to framework-agnostic representation.
3. **Generator** (`src/core/generator/`): Emit TypeScript code.

**Golden Rule:** Do not skip layers. Generator must not access raw OpenAPI documents. Parser must not apply business logic.

### Adding a New Feature

**Example: Support a new validation rule (e.g., `@Pattern(regex)`)**

1. **Update IR**: Add validator type to `src/core/ir/interfaces/models.ts`:

   ```typescript
   export type IrValidatorType = '...' | 'PATTERN' | '...';
   ```

2. **Update Mapper**: Extract `pattern` in `src/core/ir/analyzer/type.mapper.ts`:

   ```typescript
   if (schema.pattern) {
     validators.push({ type: 'PATTERN', value: schema.pattern });
   }
   ```

3. **Update Generator**: Apply decorator in `src/core/generator/writers/dto.writer.ts`:

   ```typescript
   if (validator.type === 'PATTERN') {
     propDecl.addDecorator({
       name: 'Matches',
       arguments: [validator.value],
     });
   }
   ```

4. **Test**: Add unit tests for each layer. Add integration test to `test/e2e/`.

## Testing

### Unit Tests

Located in `test/units/`. Test components in isolation using mocks:

```typescript
describe('DtoWriter', () => {
  it('should generate a DTO class with properties', () => {
    const projectMock = { createSourceFile: vi.fn() };
    const writer = new DtoWriter(projectMock, '/out');

    // Assert behavior
  });
});
```

### Integration Tests

Test the full pipeline (Parser → IR → Generator):

```typescript
describe('Full Pipeline', () => {
  it('should convert petstore.json to NestJS module', async () => {
    const spec = JSON.parse(readFileSync('./test/fixtures/petstore.json'));
    const converter = new OpenApiConverter(spec);
    const ir = converter.convert();

    // Assert IR structure
  });
});
```

### E2E Tests

Run the CLI and validate output structure (see `test/e2e/generator.e2e-spec.ts`):

```bash
nog-cli generate test/fixtures/petstore.json -o /tmp/output
# Load output into ts-morph Project
# Verify classes, methods, imports exist
```

## Git Workflow

### Branch Naming

Use descriptive branch names:

- `feature/add-graphql-support`
- `fix/circular-dependency-resolution`
- `docs/update-architecture-guide`

### Commit Messages

Follow conventional commits:

```
feat: add support for oneOf discriminator mapping
fix: resolve circular import in service.writer.ts
docs: improve README with quick start guide
test: add coverage for edge case schemas
```

### Pull Request Checklist

Before submitting a PR:

- [ ] Code builds without errors: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] Coverage maintained above 90%: `npm run test:coverage`
- [ ] Linting passes: `npm run lint`
- [ ] Code formatted: `npm run format`
- [ ] JSDoc added for public APIs
- [ ] No debug code or `TODO` comments
- [ ] PR description explains _why_ changes were made

## Reporting Issues

When reporting bugs or requesting features:

1. **Search existing issues** to avoid duplicates.
2. **Provide context**: OpenAPI spec (sanitized), error message, reproduction steps.
3. **Include environment**: Node.js version, nog-cli version, OS.

## License

By contributing to `nog-cli`, you agree that your contributions will be licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

## Questions?

If you have questions or need clarification, open a GitHub discussion or issue. We welcome questions that help improve this guide.

Thank you for contributing to `nog-cli`!
