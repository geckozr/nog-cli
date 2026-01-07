import { describe, expect, it } from 'vitest';

import { TypeHelper } from '../../../src/core/generator/helpers/type.helper';

describe('TypeHelper', () => {
  describe('irTypeToString', () => {
    it('should convert primitive types to string', () => {
      const type = { rawType: 'string', isArray: false, isPrimitive: true };
      expect(TypeHelper.irTypeToString(type)).toBe('string');
    });

    it('should convert array types', () => {
      const type = { rawType: 'string', isArray: true, isPrimitive: true };
      expect(TypeHelper.irTypeToString(type)).toBe('string[]');
    });

    it('should convert custom DTO types', () => {
      const type = { rawType: 'UserDto', isArray: false, isPrimitive: false };
      expect(TypeHelper.irTypeToString(type)).toBe('UserDto');
    });

    it('should convert custom DTO array types', () => {
      const type = { rawType: 'UserDto', isArray: true, isPrimitive: false };
      expect(TypeHelper.irTypeToString(type)).toBe('UserDto[]');
    });

    it('should handle union types with quotes', () => {
      const type = {
        rawType: ['available', 'pending', 'sold'],
        isArray: false,
        isPrimitive: true,
        composition: 'union' as const,
      };
      expect(TypeHelper.irTypeToString(type)).toBe("'available' | 'pending' | 'sold'");
    });

    it('should handle union types without quotes for DTO', () => {
      const type = {
        rawType: ['UserDto', 'AdminDto'],
        isArray: false,
        isPrimitive: false,
        composition: 'union' as const,
      };
      expect(TypeHelper.irTypeToString(type)).toBe('UserDto | AdminDto');
    });

    it('should handle intersection types', () => {
      const type = {
        rawType: ['UserDto', 'ProfileDto'],
        isArray: false,
        isPrimitive: false,
        composition: 'intersection' as const,
      };
      expect(TypeHelper.irTypeToString(type)).toBe('UserDto & ProfileDto');
    });

    it('should handle union array types', () => {
      const type = {
        rawType: ['available', 'pending', 'sold'],
        isArray: true,
        isPrimitive: true,
        composition: 'union' as const,
      };
      expect(TypeHelper.irTypeToString(type)).toBe("('available' | 'pending' | 'sold')[]");
    });

    it('should handle intersection array types', () => {
      const type = {
        rawType: ['UserDto', 'ProfileDto'],
        isArray: true,
        isPrimitive: false,
        composition: 'intersection' as const,
      };
      expect(TypeHelper.irTypeToString(type)).toBe('(UserDto & ProfileDto)[]');
    });
  });

  describe('needsImport', () => {
    it('should return false for primitive types', () => {
      const type = { rawType: 'string', isArray: false, isPrimitive: true };
      expect(TypeHelper.needsImport(type)).toBe(false);
    });

    it('should return true for custom DTO types', () => {
      const type = { rawType: 'UserDto', isArray: false, isPrimitive: false };
      expect(TypeHelper.needsImport(type)).toBe(true);
    });

    it('should return false for void types', () => {
      const type = { rawType: 'void', isArray: false, isPrimitive: true };
      expect(TypeHelper.needsImport(type)).toBe(false);
    });

    it('should return false for any types', () => {
      const type = { rawType: 'any', isArray: false, isPrimitive: true };
      expect(TypeHelper.needsImport(type)).toBe(false);
    });

    it('should return false for Date types', () => {
      const type = { rawType: 'Date', isArray: false, isPrimitive: false };
      expect(TypeHelper.needsImport(type)).toBe(false);
    });

    it('should return false for Blob types', () => {
      const type = { rawType: 'Blob', isArray: false, isPrimitive: false };
      expect(TypeHelper.needsImport(type)).toBe(false);
    });

    it('should return false for Record types', () => {
      const type = {
        rawType: 'Record<string, UserDto>',
        isArray: false,
        isPrimitive: false,
      };
      expect(TypeHelper.needsImport(type)).toBe(false);
    });

    it('should return false for union types (inline enums)', () => {
      const type = {
        rawType: ['available', 'pending', 'sold'],
        isArray: false,
        isPrimitive: true,
        composition: 'union' as const,
      };
      expect(TypeHelper.needsImport(type)).toBe(false);
    });

    it('should return true for intersection types with DTOs', () => {
      const type = {
        rawType: ['UserDto', 'ProfileDto'],
        isArray: false,
        isPrimitive: false,
        composition: 'intersection' as const,
      };
      expect(TypeHelper.needsImport(type)).toBe(true);
    });

    it('should return true for union types with DTOs (non-union composition)', () => {
      const type = {
        rawType: ['UserDto', 'ProfileDto'],
        isArray: false,
        isPrimitive: false,
        composition: 'intersection' as const,
      };
      expect(TypeHelper.needsImport(type)).toBe(true);
    });

    it('should return false for union with only primitives', () => {
      const type = {
        rawType: ['string', 'number', 'boolean'],
        isArray: false,
        isPrimitive: true,
        composition: 'union' as const,
      };
      expect(TypeHelper.needsImport(type)).toBe(false);
    });
  });

  describe('extractRecordValueType', () => {
    it('should extract simple Record value type', () => {
      const result = TypeHelper.extractRecordValueType('Record<string, UserDto>');
      expect(result).toBe('UserDto');
    });

    it('should extract Record with primitive value type', () => {
      const result = TypeHelper.extractRecordValueType('Record<string, string>');
      expect(result).toBe('string');
    });

    it('should extract Record with complex key and value', () => {
      const result = TypeHelper.extractRecordValueType('Record<string, ProfileDto>');
      expect(result).toBe('ProfileDto');
    });

    it('should handle Record with spaces', () => {
      const result = TypeHelper.extractRecordValueType('Record<string,  UserDto>');
      expect(result).toBe('UserDto');
    });

    it('should return null for non-Record types', () => {
      const result = TypeHelper.extractRecordValueType('string');
      expect(result).toBeNull();
    });

    it('should return null for malformed Record', () => {
      const result = TypeHelper.extractRecordValueType('RecordUserDto');
      expect(result).toBeNull();
    });
  });

  describe('getFileName', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(TypeHelper.getFileName('UserDto')).toBe('user-dto');
    });

    it('should handle multiple capital letters', () => {
      expect(TypeHelper.getFileName('HTTPService')).toBe('http-service');
    });

    it('should handle single word', () => {
      expect(TypeHelper.getFileName('User')).toBe('user');
    });

    it('should lowercase already lowercase', () => {
      expect(TypeHelper.getFileName('user')).toBe('user');
    });

    it('should handle RoleEnum', () => {
      expect(TypeHelper.getFileName('RoleEnum')).toBe('role-enum');
    });

    it('should handle ProfileDto', () => {
      expect(TypeHelper.getFileName('ProfileDto')).toBe('profile-dto');
    });

    it('should handle APIKey', () => {
      expect(TypeHelper.getFileName('APIKey')).toBe('api-key');
    });

    it('should handle UserRecords', () => {
      expect(TypeHelper.getFileName('UserRecords')).toBe('user-records');
    });
  });
});
