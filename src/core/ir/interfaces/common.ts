/**
 * Represents a TypeScript type in the Intermediate Representation (IR).
 * This is the core abstraction for all type information extracted from OpenAPI schemas.
 */
export interface IrType {
  /**
   * The raw TypeScript type string(s).
   * - For simple types: a single string (e.g., 'string', 'number', 'UserDto')
   * - For composed types (union/intersection): an array of type strings (e.g., ['Cat', 'Dog'])
   * @example 'string'
   * @example 'UserProfile'
   * @example ['TextContent', 'ImageContent', 'VideoContent']
   */
  rawType: string | string[];

  /**
   * Indicates if this type represents an array.
   * When true, the generated TypeScript code will append `[]` to the type.
   * @example If `rawType` is 'User' and `isArray` is true, generates: `User[]`
   */
  isArray: boolean;

  /**
   * Indicates if this is a primitive TypeScript type (string, number, boolean, Date, etc.).
   * When false, the type represents a reference to another DTO/model that requires an import.
   * @example true for 'string', 'number', 'boolean'
   * @example false for 'UserDto', 'AnimalDto'
   */
  isPrimitive: boolean;

  /**
   * Specifies how multiple types should be composed when `rawType` is an array.
   * - 'union': Types are combined with `|` (OR semantics, from OpenAPI oneOf)
   * - 'intersection': Types are combined with `&` (AND semantics, from OpenAPI allOf)
   * @example 'union' → `Cat | Dog | Bird`
   * @example 'intersection' → `BaseEntity & Timestamped`
   */
  composition?: 'intersection' | 'union';
}

/**
 * Represents a validation rule to be applied to a DTO property.
 * Maps to class-validator decorators in the generated code.
 */
export interface IrValidator {
  /**
   * The type of validation rule.
   * Each type maps to a specific class-validator decorator:
   * - IS_EMAIL → @IsEmail()
   * - IS_UUID → @IsUUID()
   * - IS_DATE → @IsDate()
   * - IS_URL → @IsUrl()
   * - MIN → @Min(value)
   * - MAX → @Max(value)
   * - MIN_LENGTH → @MinLength(value)
   * - MAX_LENGTH → @MaxLength(value)
   * - IS_NOT_EMPTY → @IsNotEmpty()
   * - MATCHES → @Matches(pattern)
   */
  type:
    | 'IS_EMAIL'
    | 'IS_UUID'
    | 'IS_DATE'
    | 'IS_URL'
    | 'MIN'
    | 'MAX'
    | 'MIN_LENGTH'
    | 'MAX_LENGTH'
    | 'IS_NOT_EMPTY'
    | 'MATCHES';

  /**
   * Optional parameters for validators that require configuration.
   * - For MIN/MAX: numeric value
   * - For MIN_LENGTH/MAX_LENGTH: numeric value
   * - For MATCHES: regex pattern string
   * @example For MIN: { params: 0 }
   * @example For MATCHES: { params: '^[a-zA-Z]+$' }
   */
  params?: number | string;
}
