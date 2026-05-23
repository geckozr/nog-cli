import { IrValidator } from './common';

/**
 * Maps IrValidator types to their class-validator decorator names.
 */
export const VALIDATOR_DECORATOR_MAP: Record<IrValidator['type'], string> = {
  IS_EMAIL: 'IsEmail',
  IS_UUID: 'IsUUID',
  IS_DATE: 'IsDate',
  IS_URL: 'IsUrl',
  MIN: 'Min',
  MAX: 'Max',
  MIN_LENGTH: 'MinLength',
  MAX_LENGTH: 'MaxLength',
  MATCHES: 'Matches',
  IS_NOT_EMPTY: 'IsNotEmpty',
};

/*
/**
   * Maps internal validation rule types to their corresponding class-validator decorator names.
   *
   * This registry ensures consistent translation from OpenAPI validation constraints
   * to TypeScript decorator syntax compatible with NestJS validation pipes.
   *
   * @internal
   * /
  private static readonly VALIDATOR_MAP: Record<string, string> = {
    IS_EMAIL: 'IsEmail',
    IS_UUID: 'IsUUID',
    IS_DATE: 'IsDate',
    IS_URL: 'IsUrl',
    MIN: 'Min',
    MAX: 'Max',
    MIN_LENGTH: 'MinLength',
    MAX_LENGTH: 'MaxLength',
    MATCHES: 'Matches',
    IS_NOT_EMPTY: 'IsNotEmpty',
    IS_STRING: 'IsString',
    IS_NUMBER: 'IsNumber',
    IS_BOOLEAN: 'IsBoolean',
    IS_OPTIONAL: 'IsOptional',
  };
  */
