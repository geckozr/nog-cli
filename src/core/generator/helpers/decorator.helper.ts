import { PropertyDeclaration } from 'ts-morph';

import { IrValidator } from '../../ir/interfaces';

/**
 * Helper class to manage `class-validator` decorators on class properties.
 * It maps internal validation rules (IR) to specific TypeScript decorators.
 */
export class DecoratorHelper {
  /**
   * Mappa i validatori IR ai decoratori class-validator
   */
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

  /**
   * Applies a list of validators to a ts-morph property declaration.
   *
   * @param prop - The property declaration to modify.
   * @param validators - The list of internal validation rules to apply.
   */
  static addValidators(prop: PropertyDeclaration, validators: IrValidator[]): void {
    for (const validator of validators) {
      this.addValidator(prop, validator);
    }
  }

  /**
   * Collects all unique decorator names required by the validators.
   * Useful for generating the import statement at the top of the file.
   *
   * @param validators - The list of validators to analyze.
   * @returns An array of unique decorator names (e.g., ['IsString', 'IsOptional']).
   */
  static collectDecoratorNames(validators: IrValidator[]): string[] {
    const names = new Set<string>();

    for (const validator of validators) {
      const decoratorName = this.mapValidatorToDecorator(validator.type);
      if (decoratorName) {
        names.add(decoratorName);
      }
    }

    return Array.from(names);
  }

  private static addValidator(prop: PropertyDeclaration, validator: IrValidator): void {
    const decoratorName = this.mapValidatorToDecorator(validator.type);

    if (!decoratorName) {
      // If the validator type is unknown, we skip it to avoid generating invalid code.
      return;
    }

    const args = this.getValidatorArguments(validator);

    prop.addDecorator({
      name: decoratorName,
      arguments: args,
    });
  }

  private static mapValidatorToDecorator(type: string): string {
    return this.VALIDATOR_MAP[type];
  }

  private static getValidatorArguments(validator: IrValidator): string[] {
    if (validator.params === undefined || validator.params === null) {
      return [];
    }

    // Special handling for Regex patterns: wrapper them in slashes
    if (validator.type === 'MATCHES') {
      return [`/${validator.params}/`];
    }

    return [String(validator.params)];
  }
}
