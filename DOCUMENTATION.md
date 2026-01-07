# Nog-CLI Architecture and Design Guide

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Data Flow Pipeline](#data-flow-pipeline)
3. [Core Concepts](#core-concepts)
4. [Design Decisions](#design-decisions)
5. [Directory Structure](#directory-structure)
6. [Development Patterns](#development-patterns)

## High-Level Architecture

`nog-cli` is implemented as a unidirectional three-stage compiler:

```
OpenAPI Spec (Input)
        ↓
    [Parser]         - Load, validate, and dereference
        ↓
 Internal Representation (IR) - Normalize to framework-agnostic structure
        ↓
   [Generator]       - Emit TypeScript code via ts-morph AST
        ↓
Generated NestJS Module (Output)
```

This architecture provides several benefits:

- **Separation of Concerns**: Parser, normalization, and generation are decoupled.
- **Testability**: Each stage can be tested independently.
- **Extensibility**: New output formats can be added by implementing new generators without modifying the parser or IR.
- **Framework Agnosticism**: The IR is not tied to NestJS, allowing future support for other frameworks.

## Data Flow Pipeline

### Stage 1: Parser

**Location:** `src/core/parser/`

The parser ingests OpenAPI specifications (JSON or YAML) and resolves external references using `@apidevtools/json-schema-ref-parser`.

Key responsibilities:

- Load OpenAPI files from filesystem or HTTP URLs.
- Validate OpenAPI version (3.0.x or 3.1.x).
- Bundle external references (`$ref`) while preserving schema identity.
- Return a validated `OpenApiDocument` object.

**Key File:** `src/core/parser/openapi.parser.ts`

### Stage 2: Internal Representation (IR)

**Location:** `src/core/ir/`

The IR is a simplified, normalized representation of an API specification that abstracts away OpenAPI-specific details.

#### IR Structures

- **IrDefinition**: Root container with metadata, models, and services.
- **IrModel**: Represents a schema (DTO or Enum).
- **IrService**: Represents a logical grouping of operations.
- **IrOperation**: Represents a single HTTP operation (GET, POST, etc.).
- **IrType**: Represents a TypeScript type (primitives, arrays, unions, references).
- **IrValidator**: Represents a validation rule (`IS_EMAIL`, `MIN_LENGTH`, etc.).

#### Two-Pass Conversion Algorithm

The `OpenApiConverter` resolves circular dependencies using a two-pass approach:

**Pass 1 (Discovery):** Iterate through all schemas and create empty model shells in the registry.

- Result: `UserDto` and `PostDto` exist in memory but have no properties yet.

**Pass 2 (Population):** Iterate again and populate properties. Forward references are resolved from the registry.

- Result: `UserDto.posts: PostDto[]` successfully references the already-created `PostDto`.

**Key File:** `src/core/ir/openapi.converter.ts`

### Stage 3: Generator

**Location:** `src/core/generator/`

The generator consumes the IR and emits TypeScript code using the `ts-morph` library (Abstract Syntax Tree manipulation).

#### Writer Classes

- **DtoWriter**: Emits DTO classes and Enums.
- **ServiceWriter**: Emits NestJS Service classes.
- **ModuleWriter**: Emits the primary NestJS Module that wires services.
- **IndexWriter**: Emits barrel export files (`index.ts`).

**Key File:** `src/core/generator/engine.ts`

## Core Concepts

### Pure OneOf vs. Hybrid OneOf

The generator distinguishes between two types of union schemas:

#### Pure OneOf (Type Alias)

A schema is "pure OneOf" when:

- It declares a discriminator and subTypes.
- It has no own properties.
- It has no base class.

**Rendering:** Type alias

```typescript
export type MediaUnion = ImageDto | VideoDto | AudioDto;
```

#### Hybrid OneOf (Class)

A schema is "hybrid" when:

- It has its own properties AND a discriminator (mixed composition).
- It has a base class but also defines subTypes.

**Rendering:** Class with properties and optional inheritance

```typescript
export class BaseContent {
  @IsNotEmpty()
  public id: string;

  @IsString()
  public kind: 'text' | 'image' | 'video';
}
```

### Dual Service Methods

Each NestJS service operation generates two method variants:

#### Observable Method (Suffix `$`)

Returns `Observable<T>` from RxJS:

```typescript
public getUserById$(id: string): Observable<UserDto> {
  const url = `/users/${id}`;
  return this.httpService.get<UserDto>(url).pipe(
    map(response => response.data),
  );
}
```

Advantage: Reactive programming, powerful operators (map, filter, switchMap, etc.).

#### Promise Method

Wraps the Observable variant using `firstValueFrom()`, returns `Promise<T>`:

```typescript
public getUserById(id: string): Promise<UserDto> {
  return firstValueFrom(this.getUserById$(id));
}
```

Advantage: Familiar async/await syntax, easier for imperative code.

**Strategy:** Developers choose which variant fits their use case. Both share underlying HTTP logic.

### Validation Decorators

Generated DTOs use `class-validator` decorators for runtime validation:

```typescript
import { IsEmail, IsNotEmpty, Min, Max } from 'class-validator';

export class UserDto {
  @IsEmail()
  public email: string;

  @IsNotEmpty()
  @Min(18)
  @Max(120)
  public age: number;
}
```

Validation rules are automatically extracted from OpenAPI schema constraints:

- `required` → `@IsNotEmpty()`
- `format: email` → `@IsEmail()`
- `minimum`, `maximum` → `@Min()`, `@Max()`
- `pattern` → `@Matches()`
- `enum` → `@IsIn()`

## Design Decisions

### Why ts-morph for Code Generation?

We use `ts-morph` (AST manipulation) instead of string templates because:

- **Correctness:** Impossible to emit syntactically invalid code.
- **Formatting:** Automatic indentation, semicolons, and line breaks.
- **Maintenance:** Changes to code structure are declarative, not brittle.
- **Testing:** Emitted code can be validated by loading into a `Project` and inspecting the AST.

### Why Two-Pass Circular Dependency Resolution?

Instead of using dereferencing (inlining all schemas), we use the two-pass algorithm because:

- **Schema Identity:** Named models remain named, not flattened into inline types.
- **Maintainability:** Generated code references `UserDto`, not an expanded object literal.
- **Performance:** Large circular graphs are handled gracefully.

### Why Separate Parser, IR, and Generator?

This separation enables:

- **Testability:** Each layer can be tested independently.
- **Extensibility:** Future support for GraphQL, gRPC, or other targets.
- **Clarity:** Business logic (normalization) is isolated from I/O and code emission.

## Directory Structure

```
src/
├── cli/                          # User Interface Layer (Commander.js)
│   ├── commands/
│   │   └── generate.command.ts   # Generate command logic
│   ├── types.ts                  # CLI configuration interfaces
│   └── program.ts                # CLI program setup
│
├── core/                         # Compiler Core
│   ├── parser/
│   │   └── openapi.parser.ts     # Stage 1: Parse OpenAPI
│   │
│   ├── ir/
│   │   ├── interfaces/
│   │   │   └── models.ts         # IR type definitions
│   │   ├── analyzer/
│   │   │   ├── type.mapper.ts    # Maps OpenAPI types to IR types
│   │   │   └── schema.merger.ts  # Merges allOf schemas
│   │   └── openapi.converter.ts  # Stage 2: Convert to IR
│   │
│   └── generator/
│       ├── engine.ts             # Stage 3: Orchestrator
│       ├── writers/
│       │   ├── dto.writer.ts     # Emit DTOs and Enums
│       │   ├── service.writer.ts # Emit NestJS Services
│       │   ├── module.writer.ts  # Emit NestJS Module
│       │   └── index.writer.ts   # Emit barrel exports
│       └── helpers/
│           ├── type.helper.ts    # Type conversion utilities
│           ├── import.helper.ts  # Import statement generation
│           ├── decorator.helper.ts # Decorator application
│           └── file-header.helper.ts # Generated file headers
│
└── utils/
    ├── logger.ts                 # Logging utilities
    ├── naming.ts                 # Case conversion (camelCase, PascalCase, etc.)
    └── index.ts                  # Public exports

test/
├── e2e/
│   └── generator.e2e-spec.ts     # End-to-end test suite
├── fixtures/
│   ├── petstore.json             # Standard test spec
│   ├── cyclos.json               # Real-world complex spec
│   └── complex.json              # Edge case spec
└── units/
    ├── parser/                   # Parser unit tests
    ├── ir/                       # IR conversion tests
    └── generator/                # Writer unit tests
```

## Development Patterns

### Clean Architecture Principles

1. **Dependency Injection**: Writers receive dependencies through constructors, never instantiate them.
2. **Interface Segregation**: Each layer exposes minimal public APIs.
3. **Immutability**: The IR is treated as immutable once generated. Generators do not modify it.

### Adding a New Feature

**Scenario: Support a new validation rule (e.g., `@Pattern(regex)`)**

1. **Update IR:** Add `'PATTERN'` to the `IrValidator` union type in `src/core/ir/interfaces/models.ts`.
2. **Update Analyzer:** In `src/core/ir/analyzer/type.mapper.ts`, extract the `pattern` field from OpenAPI schemas and add a `PATTERN` validator.
3. **Update Generator:** In `src/core/generator/writers/dto.writer.ts`, read the `PATTERN` validator and apply the `@Matches()` decorator using `ts-morph`.

### Testing Strategy

- **Unit Tests**: Test individual components (`TypeMapper`, `DtoWriter`) in isolation using mocks.
- **Integration Tests**: Test full conversion pipeline (`OpenApiParser` → `OpenApiConverter`).
- **E2E Tests**: Run CLI against fixture specs and validate generated AST structure (no compilation required).

**Test Coverage Requirement:** Greater than 90% line coverage across all layers.

### Code Standards

- **Strict TypeScript**: `strict: true` in `tsconfig.json`. No `any` types without justification.
- **Logging**: Use `src/utils/logger` instead of `console.log()`.
- **Error Handling**: Use custom Exceptions or log errors via Logger. No empty `catch` blocks.
- **No Debug Code**: No commented-out code, no `TODO` notes without context, no debug `console.log()`.
- **Documentation**: JSDoc comments for exported classes, methods, and interfaces. Explain _why_, not _what_.

## Further Reading

- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.3)
- [NestJS Documentation](https://docs.nestjs.com/)
- [ts-morph Documentation](https://ts-morph.readthedocs.io/)
- [class-validator Documentation](https://github.com/typestack/class-validator)
