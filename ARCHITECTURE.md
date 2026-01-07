# Nog-CLI Architecture Guide

**Note for AI Agents**: This project follows a strict Compiler Design Pattern. Do not modify files ad-hoc. Follow the data flow: Parser -> IR -> Generator.

## 1. High-Level Overview

`nog-cli` is a **Unidirectional Compiler** that transforms OpenAPI Specifications (Input) into NestJS Modules (Output).

It is composed of three distinct layers:

- **Frontend (Parser)**: Ingests YAML/JSON, validates it, and resolves external references ($ref).
- **Middle-end (IR)**: Transforms the raw OpenAPI AST into a simplified, type-safe **Intermediate Representation (IR)**. This is where business logic (naming, deduping, relationship linking) lives.
- **Backend (Generator)**: Consumes the IR and emits TypeScript code using ts-morph AST manipulation. **No string concatenation allowed for code generation.**

## 2. Directory Structure & Responsibilities

src/
├── cli/ # UI Layer (Commander.js)
│ ├── commands/ # Command logic (e.g., generate.cmd.ts)
│ └── options.ts # CLI Flags definition
│ ├── config/ # Configuration Loading
│ └── config.loader.ts # Merges CLI flags with nog.config.json
│ ├── core/ # THE COMPILER CORE
│ ├── parser/ # [Layer 1] Input Processing
│
│ ├── spec.loader.ts # I/O: FileSystem & HTTP loading
│ │ └── openapi.parser.ts # Parsing & Bundle via swagger-parser
│ │
│ ├── ir/ # [Layer 2] Intermediate Representation │

│ ├── models.ts # TYPES ONLY: Defines IrModel, IrService
│
│ ├── converter.ts # LOGIC: OpenAPI -> IR Transformer
│ │ └── analyzer/ # Helpers for type mapping & analysis
│
│ ├── type.mapper.ts # Maps OpenAPI types to IR types
│ │ └── validator.map.ts # Maps constraints to class-validator
│ │ │ └── generator/ # [Layer 3] Code Emission (ts-morph)
│ ├── printer.engine.ts # Main orchestrator (FileSystem writes)
│ └── writers/ # Logic for writing specific file types
│ ├── dto.writer.ts # Writes _.dto.ts
│ ├── service.writer.ts # Writes _.service.ts
│ └── module.writer.ts # Writes \*.module.ts
│ └── utils/ # Shared utilities (Logger, Naming, FS)

## 3. Core Concepts & Algorithms

### 3.1 The Intermediate Representation (IR)

The IR (`src/core/ir/models.ts`) is the contract between the Parser and the Generator. It decouples the specific OpenAPI version (v3.0/v3.1) from the output code.

`Key Rule`: The Generator MUST NOT access the raw OpenAPI document. It only consumes `IrDefinition`.

### 3.2 Handling Circular Dependencies (The Two-Pass Algorithm)

OpenAPI schemas often contain circular references (User -> Post -> User). To handle this without infinite loops during parsing, `OpenApiConverter` uses a **Two-Pass Algorithm**:

1. **Pass 1 (Discovery)**: Iterate through all schemas and create "Empty Shells" (instances of `IrModel` with just the name) in the `modelsRegistry`.

- Result: `UserDto` and `PostDto` exist in memory, but have no properties.

2. **Pass 2 (Population)**: Iterate again and populate properties. When `UserDto` needs `PostDto`, it looks it up in the registry. Since `PostDto` already exists (created in Pass 1), the reference is resolved successfully.

### 3.3 Type Mapping Strategy

The `TypeMapper` (`src/core/ir/analyzer/type.mapper.ts`) is responsible for converting OpenAPI types to TypeScript/IR types.

- `type: string, format: date` -> `IrType { raw: 'Date', isPrimitive: true }`
- `$ref: '#/components/schemas/User'` -> `IrType { raw: 'UserDto', isPrimitive: false }`

## 4. Development Workflow

**How to add a new feature**

**Scenario A: Support a new Validation Rule (e.g., @Max(100))**

1. **Modify IR**: Update `IrValidator` in `src/core/ir/models.ts` to include the new validator type (e.g., `'MAX'`).
2. ''Update Mapper'': In `src/core/ir/analyzer/type.mapper.ts`, extract the `maximum` field from the OpenAPI schema and push a `'MAX'` validator to the list.
3. **Update Generator**: In `src/core/generator/writers/dto.writer.ts`, read the `'MAX'` validator from the IR and add the `@Max()` decorator to the class property using `ts-morph`.

**Scenario B: Change how Services are generated**

1. **Modify Generator**: Edit `src/core/generator/writers/service.writer.ts`.
2. **Do NOT touch IR**: Unless you need data that isn't currently extracted from the OpenAPI spec.

**How to Test**
**Unit Tests**: Located in `test/unit`. Test `TypeMapper` and `OpenApiConverter` in isolation.

**E2E Tests**: Located in `test/e2e`. Run the full CLI against `test/fixtures/petstore.yaml` and verify the output compiles with `tsc`.

## 5. Coding Standards

- **Strict Typing**: No `any`. Use `unknown` if necessary and cast with type guards.
- **AST over Strings**: Never build code using string templates (`export class ${name}`). Always use `ts-morph` methods (`sourceFile.addClass(...)`).
- **Immutability**: The IR should be treated as immutable once passed to the Generator.

- Naming:
  - Classes: `PascalCase`
  - Files: `kebab-case`
  - Methods/Properties: `camelCase`
