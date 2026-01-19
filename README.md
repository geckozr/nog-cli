# nog-cli (NestJS OpenAPI Generator)

[![CI](https://github.com/geckozr/nog-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/geckozr/nog-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@gecko_zr/nog-cli.svg)](https://www.npmjs.com/package/@gecko_zr/nog-cli)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/node/v/@gecko_zr/nog-cli.svg)](https://nodejs.org/)
[![codecov](https://codecov.io/gh/geckozr/nog-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/geckozr/nog-cli)
[![Documentation](https://img.shields.io/badge/docs-TypeDoc-blue.svg)](https://geckozr.github.io/nog-cli/)

**nog-cli** is a powerful CLI tool that transforms OpenAPI 3.0 specifications into production-ready Internal HTTP Clients for your NestJS ecosystem. It eliminates the need for manual boilerplate, delivering type-safe SDKs that feel like a native part of your application.

## Overview

`nog-cli` (acronym for **N**estJs **O**penApi **G**enerator **Cli**) automates the integration process by generating a complete NestJS Module designed for enterprise-grade standards.

The generated code provides:

- **Ready-to-use Modules**: Fully compatible with NestJS Dependency Injection.
- **Typed HTTP Services**: Clean, injectable classes for making REST calls without the guesswork.
- **Runtime Validation**: Data Transfer Objects (DTOs) powered by class-validator for zero runtime surprises.
- **Architectural Consistency**: Immutability, strict TypeScript compliance, and zero proprietary runtime dependencies.

## Key Features

- **Type-Safe DTOs**: Generates `class-validator` decorated Data Transfer Objects with automatic validation.
- **Polymorphism Support**: Handles complex union types (`oneOf`, `allOf`) via intelligent "Pure OneOf" and "Hybrid" strategies.
- **Developer Flexibility**: Every operation generates both Observable (RxJS) and Promise (async/await) methods to suit any coding style.
- **Clean Architecture**: Built with a decoupled pipeline (Parser → IR → Generator) and maintained with over 90% test coverage.

## Installation

Install globally:

```bash
npm install -g @gecko_zr/nog-cli
```

Or as a dev dependency:

```bash
npm install --save-dev @gecko_zr/nog-cli
```

## Quick Start

### 1. Generate SDK from OpenAPI File

```bash
nog-cli generate ./specs/petstore.json -o ./src/generated
```

### 2. Use the Generated Module

```typescript
import { ApiModule } from './generated';
import { UserService } from './generated/services';

@Module({
  imports: [
    ApiModule.forRoot({
      baseUrl: 'https://api.example.com',
      headers: { Authorization: 'Bearer <token>' },
    }),
  ],
})
export class AppModule {}

@Injectable()
export class UserController {
  constructor(private userService: UserService) {}

  async getUser(id: string): Promise<UserDto> {
    return this.userService.getUser(id);
  }
}

// Async configuration variant
@Module({
  imports: [
    ApiModule.forRootAsync({
      useFactory: async () => ({
        baseUrl: process.env.API_BASE_URL ?? 'https://api.example.com',
        headers: { Authorization: `Bearer ${process.env.API_TOKEN ?? ''}` },
      }),
    }),
  ],
})
export class AsyncAppModule {}

// Alternative: dynamic headers via an Axios interceptor
// Register a provider that enriches every outgoing request
@Injectable()
export class ApiRequestInterceptor implements OnModuleInit {
  constructor(private readonly httpService: HttpService) {}

  onModuleInit(): void {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      const dynamicHeaders = {
        'x-tenant-id': TenantContext.getCurrentTenant() ?? '',
        Authorization: `Bearer ${TokenStore.getAccessToken() ?? ''}`,
      };
      return {
        ...config,
        headers: { ...(config.headers ?? {}), ...dynamicHeaders },
      };
    });
  }
}

@Module({
  imports: [ApiModule.forRoot({ baseUrl: 'https://api.example.com' })],
  providers: [ApiRequestInterceptor],
})
export class InterceptedAppModule {}
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

### 4. File Upload and Download

The generated code automatically handles file uploads and downloads:

```typescript
import { createReadStream } from 'fs';

import { FileService, UserService } from './generated/services';

// Upload with multipart/form-data
const avatar = createReadStream('./avatar.png');
await userService.uploadAvatar({ avatar, description: 'Profile picture' });

// Upload binary stream
const document = createReadStream('./document.pdf');
await fileService.uploadDocument(document);

// Download binary file (returns Buffer in Node.js)
const pdfBuffer = await fileService.downloadDocument('doc-123');
```

## Command-Line Options

```
nog-cli generate [options] <openapiFile>

Arguments:
  openapiFile                    Path to OpenAPI specification (JSON or YAML)

Options:
  -o, --output <directory>       Output directory for generated code (default: ./output)
  -m, --module-name <name>       Name of the generated NestJS module (default: ApiModule)
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
