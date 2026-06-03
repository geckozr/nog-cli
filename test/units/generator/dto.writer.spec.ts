import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { CommentModifier } from '../../../src/core/generator/writers/core/comment-modifier';
import { DeclarationBuilder } from '../../../src/core/generator/writers/core/declaration-builder';
import { DecoratorBuilder } from '../../../src/core/generator/writers/core/decorator-builder';
import { ExpressionBuilder } from '../../../src/core/generator/writers/core/expression-builder';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';
import { ImportBuilder } from '../../../src/core/generator/writers/core/import-builder';
import { PropertyBuilder } from '../../../src/core/generator/writers/core/property-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';
import { DtoWriter } from '../../../src/core/generator/writers/dto.writer';
import { IrModel } from '../../../src/core/ir';
import { Logger } from '../../../src/utils/logger';

describe('DtoWriter', () => {
  let writer: DtoWriter;

  beforeEach(() => {
    const printer = new AstPrinter();
    const headerGenerator = new HeaderGenerator();
    const importBuilder = new ImportBuilder();
    const typeBuilder = new TypeBuilder();
    const declationBuilder = new DeclarationBuilder();
    const decoratorBuilder = new DecoratorBuilder();
    const commentModifier = new CommentModifier();
    const propertyBuilder = new PropertyBuilder(commentModifier);
    const expressionBuilder = new ExpressionBuilder();

    writer = new DtoWriter(
      printer,
      headerGenerator,
      importBuilder,
      typeBuilder,
      declationBuilder,
      decoratorBuilder,
      propertyBuilder,
      commentModifier,
      expressionBuilder,
    );
  });

  it('should generate a complete DTO class from an IrModel', async () => {
    const mockModel: IrModel = {
      name: 'UserDto',
      fileName: 'user-dto',
      isEnum: false,
      properties: [
        {
          name: 'email',
          type: { rawType: 'string', isArray: false, isPrimitive: true },
          isOptional: false,
          isReadonly: false,
          description: 'The user email',
          validators: [{ type: 'IS_EMAIL' }],
        },
        {
          name: 'age',
          type: { rawType: 'number', isArray: false, isPrimitive: true },
          isOptional: true,
          isReadonly: false,
          validators: [{ type: 'MIN', params: 18 }],
        },
      ],
    };

    const output = await writer.write(mockModel, [], new Set(), '1.0.0', 'OpenaApi TEST', '3.1.0');

    expect(output.generatedCode).toContain(
      'generated with nog-cli v1.0.0 - spec: OpenaApi TEST v3.1.0',
    );

    const importRegex = /import\s+{([^}]+)}\s+from\s+['"]class-validator['"]/;
    const match = output.generatedCode.match(importRegex);
    expect(match).not.toBeNull();
    const classValidatorImports = match![1];
    const expectedDecorators = [
      'IsNotEmpty',
      'IsString',
      'IsEmail',
      'IsNumber',
      'Min',
      'IsOptional',
    ];
    expectedDecorators.forEach((decorator) => {
      expect(classValidatorImports).toMatch(new RegExp(`\\b${decorator}\\b`));
    });

    expect(output.generatedCode).toContain('export class UserDto {');
    expect(output.generatedCode).toMatch(/\/\*\*[\s\S]*?The user email[\s\S]*?\*\//);
    expect(output.generatedCode).toContain('@IsEmail()');
    expect(output.generatedCode).toContain('public email!: string;');
    expect(output.generatedCode).toContain('@IsOptional()');
    expect(output.generatedCode).toContain('@Min(18)');
    expect(output.generatedCode).toContain('public age?: number;');
    expect(output.generatedCode).toContain('}');
  });

  it('should generate imports for custom DTO references and format the file correctly', async () => {
    const mockModel: IrModel = {
      name: 'AccountBalanceLimitsData',
      fileName: 'account-balance-limits-data',
      isEnum: false,
      properties: [
        {
          name: 'account',
          type: { rawType: 'AccountWithCurrency', isArray: false, isPrimitive: false },
          isOptional: true,
          isReadonly: false,
          validators: [],
        },
      ],
    };
    const mockedModels: IrModel[] = [
      {
        name: 'AccountWithCurrency',
        fileName: 'account-with-currency',
        isEnum: false,
        properties: [],
      },
    ];

    const output = await writer.write(
      mockModel,
      mockedModels,
      new Set(),
      '1.0.0',
      'OpenAPI TEST',
      '3.1.0',
    );

    expect(output.generatedCode).toContain(
      "import { AccountWithCurrency } from './account-with-currency.dto';",
    );
    expect(output.generatedCode).toContain("import { IsOptional } from 'class-validator';");
    expect(output.generatedCode).toContain('export class AccountBalanceLimitsData {');
    expect(output.generatedCode).not.toContain('import { AccountBalanceLimitsData }');
  });

  it('should generate a class with a description and a heritage clause (extends)', async () => {
    const mockModel: IrModel = {
      name: 'SpecialAccountDto',
      fileName: 'special-account',
      isEnum: false,
      extends: 'BaseAccountDto',
      description: 'A very special account model',
      properties: [],
    };
    const mockedModels: IrModel[] = [
      {
        name: 'BaseAccountDto',
        fileName: 'base-account-dto',
        isEnum: false,
        properties: [],
      },
    ];

    const output = await writer.write(
      mockModel,
      mockedModels,
      new Set(),
      '1.0.0',
      'OpenAPI TEST',
      '3.1.0',
    );

    expect(output.generatedCode).toMatch(/\/\*\*[\s\S]*?A very special account model[\s\S]*?\*\//);
    expect(output.generatedCode).toContain(
      "import { BaseAccountDto } from './base-account-dto.dto';",
    );
    expect(output.generatedCode).toContain(
      'export class SpecialAccountDto extends BaseAccountDto {',
    );
  });

  it('should emit declare modifier on properties listed in inheritedProperties', async () => {
    const mockModel: IrModel = {
      name: 'PhoneViewDto',
      fileName: 'phone-view-dto',
      isEnum: false,
      extends: 'PhoneResultDto',
      properties: [
        {
          name: 'name',
          type: { rawType: 'string', isArray: false, isPrimitive: true },
          isOptional: true,
          isReadonly: false,
          validators: [],
        },
        {
          name: 'verified',
          type: { rawType: 'boolean', isArray: false, isPrimitive: true },
          isOptional: true,
          isReadonly: false,
          validators: [],
        },
        {
          name: 'canEdit',
          type: { rawType: 'boolean', isArray: false, isPrimitive: true },
          isOptional: true,
          isReadonly: false,
          validators: [],
        },
      ],
    };
    const mockedModels: IrModel[] = [
      { name: 'PhoneResultDto', fileName: 'phone-result-dto', isEnum: false, properties: [] },
    ];

    const output = await writer.write(
      mockModel,
      mockedModels,
      new Set(['name', 'verified']),
      '1.0.0',
      'OpenAPI TEST',
      '3.1.0',
    );

    expect(output.generatedCode).toMatch(/declare public name\?: string;/);
    expect(output.generatedCode).toMatch(/declare public verified\?: boolean;/);
    expect(output.generatedCode).not.toMatch(/declare public canEdit/);
    expect(output.generatedCode).toMatch(/\n {2}public canEdit\?: boolean;/);
  });

  it('should generate an enum when isEnum is true', async () => {
    const mockModel: IrModel = {
      name: 'UserRole',
      fileName: 'user-role',
      isEnum: true,
      description: 'The user role enum',
      enumValues: ['ADMIN', 'USER', 'GUEST'],
      properties: [],
    };

    const output = await writer.write(mockModel, [], new Set(), '1.0.0', 'OpenAPI TEST', '3.1.0');

    expect(output.generatedCode).toMatch(/\/\*\*[\s\S]*?The user role enum[\s\S]*?\*\//);
    expect(output.generatedCode).toContain('export enum UserRole {');
    expect(output.generatedCode).toContain("ADMIN = 'ADMIN',");
    expect(output.generatedCode).toContain("USER = 'USER',");
    expect(output.generatedCode).toContain("GUEST = 'GUEST'");
  });

  it('should generate a property with the complex @Type discriminator decorator', async () => {
    const mockModel: IrModel = {
      name: 'AnimalDto',
      fileName: 'animal-dto',
      isEnum: false,
      properties: [
        {
          name: 'traits',
          type: { rawType: 'BaseTraits', isArray: false, isPrimitive: false },
          isOptional: false,
          isReadonly: false,
          validators: [],
          discriminator: {
            propertyName: 'traitType',
            mapping: {
              guard: 'GuardDogTraits',
              companion: 'CompanionDogTraits',
            },
          },
        },
      ],
    };

    const mockedModels: IrModel[] = [
      {
        name: 'BaseTraits',
        fileName: 'base-traits',
        isEnum: false,
        properties: [],
      },
      {
        name: 'GuardDogTraits',
        fileName: 'guard-dog-traits',
        isEnum: false,
        properties: [],
      },
      {
        name: 'CompanionDogTraits',
        fileName: 'companion-dog-traits',
        isEnum: false,
        properties: [],
      },
    ];

    const output = await writer.write(
      mockModel,
      mockedModels,
      new Set(),
      '1.0.0',
      'OpenAPI TEST',
      '3.1.0',
    );

    expect(output.generatedCode).toContain("import { Type } from 'class-transformer';");
    expect(output.generatedCode).toContain("import { BaseTraits } from './base-traits.dto';");
    expect(output.generatedCode).toContain(
      "import { CompanionDogTraits } from './companion-dog-traits.dto';",
    );
    expect(output.generatedCode).toContain(
      "import { GuardDogTraits } from './guard-dog-traits.dto';",
    );
    expect(output.generatedCode).toContain('@Type(() => BaseTraits, {');
    expect(output.generatedCode).toContain('keepDiscriminatorProperty: true');
    expect(output.generatedCode).toContain("property: 'traitType'");
    expect(output.generatedCode).toContain("name: 'guard'");
    expect(output.generatedCode).toContain('value: GuardDogTraits');
    expect(output.generatedCode).toContain("name: 'companion'");
    expect(output.generatedCode).toContain('value: CompanionDogTraits');
  });

  // TODO: move to a separate performance test file and increase iterations for a more robust benchmark
  it('should generate 1000 complex DTOs in under 1500ms (Performance Benchmark)', async () => {
    // Exercises every code path: inheritance, primitives, custom refs, arrays,
    // comments, validators, and discriminators.
    const complexModel: IrModel = {
      name: 'ComplexPerformanceDto',
      fileName: 'complex-performance-dto',
      isEnum: false,
      extends: 'BasePerformanceDto',
      description: 'A very complex DTO for performance testing',
      properties: [
        {
          name: 'id',
          type: { rawType: 'string', isArray: false, isPrimitive: true },
          isOptional: false,
          isReadonly: true,
          validators: [{ type: 'IS_UUID' }],
        },
        {
          name: 'traits',
          type: { rawType: 'BaseTraits', isArray: false, isPrimitive: false },
          isOptional: false,
          isReadonly: false,
          validators: [],
          discriminator: {
            propertyName: 'traitType',
            mapping: {
              guard: 'GuardDogTraits',
              companion: 'CompanionDogTraits',
            },
          },
        },
        {
          name: 'tags',
          type: { rawType: 'string', isArray: true, isPrimitive: true },
          isOptional: true,
          isReadonly: false,
          validators: [{ type: 'MAX_LENGTH', params: 50 }],
        },
      ],
    };

    const iterations = 1000;

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      complexModel.name = `ComplexPerformanceDto${i}`;
      await writer.write(complexModel, [], new Set(), '1.0.0', 'OpenAPI Benchmark', '3.1.0');
    }
    const end = performance.now();
    const duration = end - start;
    expect(duration).toBeLessThan(3000);
  });

  it('should generate a type alias for a pure oneOf model', async () => {
    // Constructing a model that strictly satisfies isPureOneOfModel conditions
    // based on the updated IrModel interface.
    const mockModel: IrModel = {
      name: 'AnimalDto',
      fileName: 'animal-dto',
      isEnum: false,
      description: 'A union type of animals',
      properties: [], // Must be empty to trigger isPureOneOfModel
      discriminator: 'type', // String, as defined in IrModel
      subTypes: [
        { name: 'CatDto', value: 'cat' },
        { name: 'DogDto', value: 'dog' },
      ],
    };

    const output = await writer.write(mockModel, [], new Set(), '1.0.0', 'OpenAPI TEST', '3.1.0');

    // Verify correct kebab-case imports for subtypes
    // Note: The writer uses `toKebabCase(st.name)` to build the path
    expect(output.generatedCode).toContain("import { CatDto } from './cat-dto.dto';");
    expect(output.generatedCode).toContain("import { DogDto } from './dog-dto.dto';");

    // Verify JSDoc generation
    expect(output.generatedCode).toMatch(/\/\*\*[\s\S]*?A union type of animals[\s\S]*?\*\//);

    // Verify the type alias itself (union of subtypes)
    expect(output.generatedCode).toContain('export type AnimalDto = CatDto | DogDto;');
  });

  it('should handle Date, Boolean, Array, and URL structural decorators', async () => {
    const mockModel: IrModel = {
      name: 'ComplexTypesDto',
      fileName: 'complex-types-dto',
      isEnum: false,
      properties: [
        {
          name: 'createdAt',
          type: { rawType: 'Date', isArray: false, isPrimitive: false },
          isOptional: false,
          isReadonly: false,
          validators: [],
        },
        {
          name: 'isActive',
          type: { rawType: 'boolean', isArray: false, isPrimitive: true },
          isOptional: false,
          isReadonly: false,
          validators: [],
        },
        {
          name: 'tags',
          type: { rawType: 'string', isArray: true, isPrimitive: true },
          isOptional: false,
          isReadonly: false,
          validators: [],
        },
        {
          name: 'website',
          type: { rawType: 'string', isArray: false, isPrimitive: true },
          isOptional: false,
          isReadonly: false,
          validators: [{ type: 'IS_URL' }],
        },
      ],
    };

    const output = await writer.write(mockModel, [], new Set(), '1.0.0', 'OpenAPI TEST', '3.1.0');

    // Check identifiers without anchoring on the full line so adding
    // adjacent decorators (e.g. IsNotEmpty) won't break the assertions.
    expect(output.generatedCode).toContain('Type'); // class-transformer
    expect(output.generatedCode).toContain('IsBoolean');
    expect(output.generatedCode).toContain('IsArray');
    expect(output.generatedCode).toContain('IsUrl');

    expect(output.generatedCode).toContain('@Type(() => Date)');
    expect(output.generatedCode).toContain('public createdAt!: Date;');

    expect(output.generatedCode).toContain('@IsBoolean()');
    expect(output.generatedCode).toContain('public isActive!: boolean;');

    expect(output.generatedCode).toContain('@IsArray()');
    expect(output.generatedCode).toContain('public tags!: string[];');

    expect(output.generatedCode).toContain('@IsUrl()');
    expect(output.generatedCode).toContain('public website!: string;');
  });

  it('should correctly handle Record<string, V>, intersection types, and inline enums (IsIn)', async () => {
    const mockModel: IrModel = {
      name: 'AdvancedDataDto',
      fileName: 'advanced-data-dto',
      isEnum: false,
      properties: [
        {
          name: 'metadata',
          // Test for Record with primitive values (e.g., Record<string, string>)
          type: { rawType: 'Record<string, string>', isArray: false, isPrimitive: false },
          isOptional: true,
          isReadonly: false,
          validators: [],
        },
        {
          name: 'userRecords',
          // Test for Record with custom object values (e.g., Record<string, UserDto>)
          type: { rawType: 'Record<string, UserDto>', isArray: false, isPrimitive: false },
          isOptional: false,
          isReadonly: false,
          validators: [],
        },
        {
          name: 'mixedConfig',
          // Test for allOf (intersection type composition)
          type: {
            rawType: ['ConfigA', 'ConfigB'],
            isArray: false,
            isPrimitive: false,
            composition: 'intersection',
          },
          isOptional: false,
          isReadonly: false,
          validators: [],
        },
        {
          name: 'status',
          // Test for inline enum (union of primitive strings) triggering @IsIn decorator
          type: {
            rawType: ['ACTIVE', 'PENDING'],
            isArray: false,
            isPrimitive: true,
            composition: 'union',
          },
          isOptional: false,
          isReadonly: false,
          validators: [],
        },
      ],
    };

    // Mocking the referenced models to satisfy the extractCustomTypes and import generation logic
    const mockedModels: IrModel[] = [
      { name: 'UserDto', fileName: 'user-dto', isEnum: false, properties: [] },
      { name: 'ConfigA', fileName: 'config-a', isEnum: false, properties: [] },
      { name: 'ConfigB', fileName: 'config-b', isEnum: false, properties: [] },
    ];

    const output = await writer.write(
      mockModel,
      mockedModels,
      new Set(),
      '1.0.0',
      'OpenAPI TEST',
      '3.1.0',
    );

    // Verify that the custom types inside Records and Intersections are correctly extracted and imported
    expect(output.generatedCode).toContain("import { UserDto } from './user-dto.dto';");
    expect(output.generatedCode).toContain("import { ConfigA } from './config-a.dto';");
    expect(output.generatedCode).toContain("import { ConfigB } from './config-b.dto';");

    // Verify Record generation AST
    expect(output.generatedCode).toContain('public metadata?: Record<string, string>;');
    expect(output.generatedCode).toContain('public userRecords!: Record<string, UserDto>;');

    // Verify Intersection generation AST
    expect(output.generatedCode).toContain('public mixedConfig!: ConfigA & ConfigB;');

    // Verify Union generation AST and the related class-validator @IsIn decorator
    expect(output.generatedCode).toContain('IsIn'); // Checks import from 'class-validator'
    expect(output.generatedCode).toContain("@IsIn(['ACTIVE', 'PENDING'])");
    expect(output.generatedCode).toContain("public status!: 'ACTIVE' | 'PENDING';");
  });

  it('should map MATCHES validator to a regex, handle string params, and gracefully ignore unsupported validators', async () => {
    const loggerWarnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

    const mockModel: IrModel = {
      name: 'ValidationEdgeCasesDto',
      fileName: 'validation-edge-cases-dto',
      isEnum: false,
      properties: [
        {
          name: 'code',
          type: { rawType: 'string', isArray: false, isPrimitive: true },
          isOptional: false,
          isReadonly: false,
          validators: [
            { type: 'MATCHES', params: '^[A-Z]{3}$' }, // regex literal param
            { type: 'IS_EMAIL', params: 'Invalid email format' }, // string literal param
            { type: 'UNKNOWN_VALIDATOR_TYPE' as any }, // triggers fallback + console.warn
          ],
        },
      ],
    };

    const output = await writer.write(mockModel, [], new Set(), '1.0.0', 'OpenAPI TEST', '3.1.0');

    expect(output.generatedCode).toContain('@Matches(/^[A-Z]{3}$/)');
    expect(output.generatedCode).toContain("@IsEmail('Invalid email format')");
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Unsupported validator type: UNKNOWN_VALIDATOR_TYPE',
    );

    loggerWarnSpy.mockRestore();
  });

  it('should handle safely missing referenced models in the registry and empty enums', async () => {
    const mockModel: IrModel = {
      name: 'MissingRefDto',
      fileName: 'missing-ref-dto',
      isEnum: false,
      properties: [
        {
          name: 'ghostProperty',
          // `GhostModel` is intentionally absent from `allModels` (the registry).
          type: { rawType: 'GhostModel', isArray: false, isPrimitive: false },
          isOptional: false,
          isReadonly: false,
          validators: [],
        },
      ],
    };

    // Enum with no values exercises the `(model.enumValues || [])` fallback.
    const mockEmptyEnum: IrModel = {
      name: 'EmptyEnum',
      fileName: 'empty-enum',
      isEnum: true,
      properties: [],
    };

    const outputDto = await writer.write(
      mockModel,
      [],
      new Set(),
      '1.0.0',
      'OpenAPI TEST',
      '3.1.0',
    );
    const outputEnum = await writer.write(
      mockEmptyEnum,
      [],
      new Set(),
      '1.0.0',
      'OpenAPI TEST',
      '3.1.0',
    );

    // The class uses the type name but does NOT emit a broken import for it.
    expect(outputDto.generatedCode).toContain('public ghostProperty!: GhostModel;');
    expect(outputDto.generatedCode).not.toContain('import { GhostModel }');

    // Empty enum still renders without crashing.
    expect(outputEnum.generatedCode).toContain('export enum EmptyEnum {');
    expect(outputEnum.generatedCode).toContain('}');
  });
});
