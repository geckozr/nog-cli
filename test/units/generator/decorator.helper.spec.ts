import { ClassDeclaration, Project, SourceFile } from 'ts-morph';
import { beforeEach, describe, expect, it } from 'vitest';

import { DecoratorHelper } from '../../../src/core/generator/helpers/decorator.helper';
import { IrValidator } from '../../../src/core/ir/interfaces';

describe('DecoratorHelper', () => {
  let project: Project;
  let sourceFile: SourceFile;
  let testClass: ClassDeclaration;

  beforeEach(() => {
    project = new Project();
    sourceFile = project.createSourceFile(
      'test.ts',
      `
      export class TestDto {
        email: string;
        password: string;
      }
    `,
    );

    testClass = sourceFile.getClassOrThrow('TestDto');
  });

  describe('addValidators', () => {
    it('should add a single validator to property', () => {
      const prop = testClass.getPropertyOrThrow('email');
      const validators: IrValidator[] = [{ type: 'IS_EMAIL' }];

      DecoratorHelper.addValidators(prop, validators);

      const decorators = prop.getDecorators();
      expect(decorators).toHaveLength(1);
      expect(decorators[0].getName()).toBe('IsEmail');
    });

    it('should add multiple validators to the same property', () => {
      const prop = testClass.getPropertyOrThrow('email');
      const validators: IrValidator[] = [{ type: 'IS_EMAIL' }, { type: 'IS_NOT_EMPTY' }];

      DecoratorHelper.addValidators(prop, validators);

      const decorators = prop.getDecorators();
      expect(decorators).toHaveLength(2);
      expect(decorators.map((d) => d.getName())).toEqual(['IsEmail', 'IsNotEmpty']);
    });

    it('should not add any decorators for an empty validator list', () => {
      const prop = testClass.getPropertyOrThrow('email');

      DecoratorHelper.addValidators(prop, []);

      const decorators = prop.getDecorators();
      expect(decorators).toHaveLength(0);
    });

    it('should handle validators with parameters correctly', () => {
      const prop = testClass.getPropertyOrThrow('password');
      const validators: IrValidator[] = [
        { type: 'MIN', params: 8 },
        { type: 'MAX', params: 100 },
      ];

      DecoratorHelper.addValidators(prop, validators);

      const decorators = prop.getDecorators();
      expect(decorators).toHaveLength(2);
      const names = decorators.map((d) => d.getName());
      expect(names).toContain('Min');
      expect(names).toContain('Max');
    });

    it('should ignore unknown validator types', () => {
      const prop = testClass.getPropertyOrThrow('email');
      const validator: IrValidator = { type: 'UNKNOWN_TYPE_XYZ' as any };

      DecoratorHelper.addValidators(prop, [validator]);

      expect(prop.getDecorators()).toHaveLength(0);
    });
  });

  describe('getValidatorArguments (private)', () => {
    it('should return empty array when validator has no params', () => {
      const validator: IrValidator = { type: 'IS_EMAIL' };
      const result = DecoratorHelper['getValidatorArguments'](validator);
      expect(result).toEqual([]);
    });

    it('should return numeric params as strings', () => {
      const validator: IrValidator = { type: 'MIN', params: 5 };
      const result = DecoratorHelper['getValidatorArguments'](validator);
      expect(result).toEqual(['5']);
    });

    it('should format MATCHES regex by wrapping it in slashes', () => {
      const validator: IrValidator = { type: 'MATCHES', params: '^[a-z]+$' };
      const result = DecoratorHelper['getValidatorArguments'](validator);
      expect(result).toEqual(['/^[a-z]+$/']);
    });
  });

  describe('mapValidatorToDecorator (private)', () => {
    it('should map known IR validators to correct class-validator decorators', () => {
      expect(DecoratorHelper['mapValidatorToDecorator']('IS_EMAIL')).toBe('IsEmail');
      expect(DecoratorHelper['mapValidatorToDecorator']('MIN')).toBe('Min');
      expect(DecoratorHelper['mapValidatorToDecorator']('IS_NOT_EMPTY')).toBe('IsNotEmpty');
    });

    it('should return undefined for unknown validator type', () => {
      const result = DecoratorHelper['mapValidatorToDecorator']('UNKNOWN_VALIDATOR');
      expect(result).toBeUndefined();
    });
  });

  describe('collectDecoratorNames', () => {
    it('should return empty array for empty validators list', () => {
      const result = DecoratorHelper.collectDecoratorNames([]);
      expect(result).toEqual([]);
    });

    it('should collect unique decorator names', () => {
      const validators: IrValidator[] = [{ type: 'IS_EMAIL' }, { type: 'MIN', params: 5 }];
      const result = DecoratorHelper.collectDecoratorNames(validators);
      expect(result).toHaveLength(2);
      expect(result).toContain('IsEmail');
      expect(result).toContain('Min');
    });

    it('should deduplicate decorator names', () => {
      const validators: IrValidator[] = [
        { type: 'IS_EMAIL' },
        { type: 'IS_EMAIL' }, // Duplicate type
      ];
      const result = DecoratorHelper.collectDecoratorNames(validators);
      expect(result).toHaveLength(1);
      expect(result).toContain('IsEmail');
    });

    it('should ignore unknown validator types when collecting names', () => {
      const validators: IrValidator[] = [
        { type: 'IS_EMAIL' },
        { type: 'UNKNOWN_VALIDATOR' as any },
      ];
      const result = DecoratorHelper.collectDecoratorNames(validators);
      expect(result).toHaveLength(1);
      expect(result).toContain('IsEmail');
      expect(result).not.toContain(undefined);
    });
  });

  describe('integration - code generation', () => {
    it('should generate valid decorator syntax in source file', () => {
      const prop = testClass.getPropertyOrThrow('email');
      const validators: IrValidator[] = [{ type: 'IS_EMAIL' }];

      DecoratorHelper.addValidators(prop, validators);

      const code = sourceFile.getFullText();
      expect(code).toContain('@IsEmail()');
      expect(code).toContain('email: string');
    });

    it('should handle MATCHES decorator with regex correctly in generated code', () => {
      const prop = testClass.getPropertyOrThrow('password');
      const validators: IrValidator[] = [{ type: 'MATCHES', params: '^[a-z]+$' }];

      DecoratorHelper.addValidators(prop, validators);

      const code = sourceFile.getFullText();
      expect(code).toContain('@Matches(/^[a-z]+$/)');
    });
  });
});
