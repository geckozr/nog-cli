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
