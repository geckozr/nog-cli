# nog-cli

[![CI](https://github.com/geckozr/nog-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/geckozr/nog-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/nog-cli.svg)](https://www.npmjs.com/package/nog-cli)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/node/v/nog-cli.svg)](https://nodejs.org/)
[![codecov](https://codecov.io/gh/geckozr/nog-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/geckozr/nog-cli)
[![Documentation](https://img.shields.io/badge/docs-TypeDoc-blue.svg)](https://geckozr.github.io/nog-cli/)

A command-line interface tool for generating strict, type-safe NestJS SDKs from OpenAPI 3.0 specifications.

## Overview

`nog-cli` transforms OpenAPI specifications into production-ready NestJS modules with full TypeScript type safety, runtime validation via `class-validator`, and support for complex polymorphic schemas. The generated code follows enterprise-grade standards: dependency injection, immutability, and zero runtime surprises.

## Key Features

- **Type-Safe DTOs**: Generates `class-validator` decorated Data Transfer Objects with automatic validation.
- **Polymorphism Support**: Handles complex union types (`oneOf`, `allOf`) via intelligent "Pure OneOf" and "Hybrid" strategies.
- **Dual Service Methods**: Each operation generates both `Observable` (RxJS) and `Promise` (async/await) variants for maximum developer flexibility.
- **Zero Runtime Dependencies**: Depends only on standard NestJS, Axios, and RxJS—no proprietary packages.
- **Production Ready**: Strict TypeScript (`strict: true`), ESLint compliance, greater than 90% test coverage.
- **Clean Architecture**: Decoupled pipeline: Parser → Internal Representation → Generator.

## Installation

Install globally:

```bash
npm install -g nog-cli
```

Or as a dev dependency:

```bash
npm install --save-dev nog-cli
```

## Quick Start

### 1. Generate SDK from OpenAPI File

```bash
nog-cli generate -i ./specs/petstore.json -o ./src/generated
```

### 2. Use the Generated Module

```typescript
import { ApiModule } from './generated';
import { UserService } from './generated/services';

@Module({
  imports: [ApiModule],
})
export class AppModule {}

@Injectable()
export class UserController {
  constructor(private userService: UserService) {}

  async getUser(id: string): Promise<UserDto> {
    return this.userService.getUser(id);
  }
}
```

### 3. Work with DTOs

All generated DTOs include validation decorators:

```typescript
import { validate } from 'class-validator';

import { UserDto } from './generated/dto';

const user = new UserDto();
user.email = 'invalid-email';

const errors = await validate(user);
if (errors.length > 0) {
  console.error('Validation failed:', errors);
}
```

## Command-Line Options

```
nog-cli generate [options] <openapiFile>

Arguments:
  openapiFile                    Path to OpenAPI specification (JSON or YAML)

Options:
  -o, --output <directory>       Output directory for generated code (default: ./output)
  -m, --module-name <name>       Name of the generated NestJS module (default: Api)
  -s, --service-prefix <prefix>  Prefix for service class names (default: empty)
  --timeout <ms>                 Timeout for remote file fetching (default: 20000)
  --no-typed-errors              Disable typed error handling
  --default-type <type>          Default TypeScript type for unknown schemas (default: any)
  -h, --help                     Display help information
```

## OpenAPI Support

Supports OpenAPI 3.0.x and 3.1.x specifications in JSON or YAML format.

External references (`$ref`) are automatically resolved and bundled.

## Architecture

Refer to [DOCUMENTATION.md](DOCUMENTATION.md) for detailed architecture overview, design decisions, and internal representation structures.

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines, testing requirements, and code standards.

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.

## Support

Report issues at GitHub Issues.
