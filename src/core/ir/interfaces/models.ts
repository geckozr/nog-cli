import { IrType, IrValidator } from './common';
import { IrService } from './services';

/**
 * The root Intermediate Representation (IR) structure.
 * Represents the complete OpenAPI specification after conversion,
 * ready for code generation.
 */
export interface IrDefinition {
  /**
   * Optional OpenAPI info metadata propagated to generated headers.
   */
  info?: {
    title?: string;
    version?: string;
  };

  /**
   * All DTO models and enums extracted from OpenAPI components/schemas.
   * Each model will generate one .dto.ts or .enum.ts file.
   */
  models: IrModel[];

  /**
   * All service classes extracted from OpenAPI paths.
   * Each service will generate one .service.ts file with HTTP client methods.
   */
  services: IrService[];
}

/**
 * Represents a Data Transfer Object (DTO) or Enum model in the IR.
 * Each IrModel corresponds to one generated TypeScript class/enum file.
 */
export interface IrModel {
  /**
   * The sanitized TypeScript class/enum name.
   * Safe to use as a TypeScript identifier (reserved words are suffixed with '_').
   * @example 'UserProfile'
   * @example 'Record_' (for the reserved word 'Record')
   * @example 'UserRole' (enum)
   */
  name: string;

  /**
   * The base filename in kebab-case without extension.
   * Used for generating file paths and import module specifiers.
   * Always uses the original schema name, regardless of reserved word conflicts.
   * @example 'user-profile' (generates user-profile.dto.ts)
   * @example 'record' (generates record.dto.ts, even though class is Record_)
   * @example 'user-role' (generates user-role.enum.ts)
   */
  fileName: string;

  /**
   * Indicates if this model represents a TypeScript enum.
   * When true, generates an enum file instead of a DTO class file.
   */
  isEnum: boolean;

  /**
   * The enum values when `isEnum` is true.
   * Each string represents one enum member value.
   * @example ['ADMIN', 'USER', 'GUEST']
   */
  enumValues?: string[];

  /**
   * The list of properties/fields for this DTO.
   * Empty for enums or pure oneOf type aliases.
   */
  properties: IrProperty[];

  /**
   * Optional description from the OpenAPI schema.
   * Used to generate JSDoc comments in the output DTO.
   */
  description?: string;

  /**
   * The name of the parent class this model extends (for inheritance via allOf).
   * When present, the generated class will use `extends ParentClass`.
   * @example 'BaseEntity' → generates: `export class User extends BaseEntity { ... }`
   */
  extends?: string;

  /**
   * The name of the discriminator property for polymorphic handling.
   * Used when this model is the parent of a discriminated union (oneOf with discriminator).
   * @example 'type' for schemas where type='cat'|'dog' determines the subtype
   */
  discriminator?: string;

  /**
   * The list of subtypes for discriminated unions (oneOf schemas).
   * Each entry maps a discriminator value to a concrete class name.
   * For pure oneOf models, this is used to generate type alias unions instead of classes.
   * @example [{ name: 'Cat', value: 'cat' }, { name: 'Dog', value: 'dog' }]
   * @example Generates: `export type Animal = Cat | Dog;` (pure oneOf)
   */
  subTypes?: { name: string; value: string }[];
}

/**
 * Represents a single property/field within a DTO class.
 */
export interface IrProperty {
  /**
   * The property name in camelCase.
   * Safe to use as a TypeScript property identifier.
   * @example 'firstName'
   * @example 'emailAddress'
   */
  name: string;

  /**
   * The type information for this property.
   * Includes primitives, DTO references, arrays, and compositions.
   */
  type: IrType;

  /**
   * Indicates if this property is optional (nullable or not required).
   * When true, generates the `?` modifier and `@IsOptional()` decorator.
   * @example `public email?: string;` with `@IsOptional()`
   */
  isOptional: boolean;

  /**
   * Indicates if this property is readonly.
   * When true, generates the `readonly` modifier.
   * @example `public readonly id: string;`
   */
  isReadonly: boolean;

  /**
   * Optional description from the OpenAPI schema.
   * Used to generate JSDoc comments for the property.
   */
  description?: string;

  /**
   * List of validation rules to apply to this property.
   * Each validator generates a class-validator decorator.
   * @example [{ type: 'IS_EMAIL' }] → generates `@IsEmail()`
   */
  validators: IrValidator[];

  /**
   * Discriminator configuration for polymorphic union properties.
   * Used with class-transformer's `@Type` decorator to enable runtime deserialization
   * of discriminated unions (oneOf with discriminator).
   * @example
   * ```
   * {
   *   propertyName: 'type',
   *   mapping: { 'guard': 'GuardDogTraits', 'companion': 'CompanionDogTraits' }
   * }
   * ```
   * Generates:
   * ```
   * @Type(() => Object, {
   *   discriminator: {
   *     property: 'type',
   *     subTypes: [
   *       { value: 'guard', name: GuardDogTraits },
   *       { value: 'companion', name: CompanionDogTraits }
   *     ]
   *   }
   * })
   * ```
   */
  discriminator?: {
    /**
     * The name of the discriminator property (e.g., 'type', 'kind', 'contentType').
     */
    propertyName: string;

    /**
     * Maps discriminator values to TypeScript class names.
     * Key: discriminator value from the schema
     * Value: TypeScript class name to instantiate
     * @example { 'text': 'TextContent', 'image': 'ImageContent' }
     */
    mapping: Record<string, string>;
  };
}
