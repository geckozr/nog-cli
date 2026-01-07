import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  generateOperationId,
  isReservedWord,
  renameIfReserved,
  sanitizeName,
  toCamelCase,
  toKebabCase,
  toPascalCase,
} from '../../../src/utils';

describe('Naming', () => {
  beforeEach(() => {});

  afterEach(() => {});

  const testString = '(hello-world)_example Test@example!';

  it('should convert a string to camelCase', () => {
    const expected = 'helloWorldExampleTestExample';
    const result = toCamelCase(testString);
    expect(result).toBe(expected);
  });

  it('should convert a string to PascalCase', () => {
    const expected = 'HelloWorldExampleTestExample';
    const result = toPascalCase(testString);
    expect(result).toBe(expected);
  });

  it('should convert a string to kebab-case', () => {
    const expected = 'hello-world-example-test-example';
    const result = toKebabCase(testString);
    expect(result).toBe(expected);
  });

  it('should correctly sanitize a string', () => {
    expect(sanitizeName('123Invalid-Name!')).toBe('_123InvalidName');
    expect(sanitizeName('Valid_Name')).toBe('Valid_Name');
    expect(sanitizeName('!@#$%^&*()')).toBe('UnknownType');
    expect(sanitizeName('delete')).toBe('_delete');
  });

  describe('generateOperationId', () => {
    it('should generate operation ID from method and path', () => {
      const result = generateOperationId('GET', '/users');
      expect(result).toBe('getUsers');
    });

    it('should handle path parameters', () => {
      const result = generateOperationId('GET', '/users/{id}');
      expect(result).toBe('getUsersById');
    });

    it('should handle multiple path segments', () => {
      const result = generateOperationId('POST', '/users/{userId}/posts/{postId}');
      expect(result).toBe('postUsersByUserIdPostsByPostId');
    });

    it('should handle lowercase method', () => {
      const result = generateOperationId('delete', '/users/{id}');
      expect(result).toBe('deleteUsersById');
    });
  });

  describe('isReservedWord', () => {
    it('should return true for TypeScript keywords', () => {
      expect(isReservedWord('delete')).toBe(true);
      expect(isReservedWord('class')).toBe(true);
      expect(isReservedWord('function')).toBe(true);
      expect(isReservedWord('const')).toBe(true);
    });

    it('should return true for global objects', () => {
      expect(isReservedWord('Array')).toBe(true);
      expect(isReservedWord('Date')).toBe(true);
      expect(isReservedWord('Error')).toBe(true);
      expect(isReservedWord('Function')).toBe(true);
      expect(isReservedWord('Map')).toBe(true);
      expect(isReservedWord('Object')).toBe(true);
      expect(isReservedWord('Promise')).toBe(true);
      expect(isReservedWord('Record')).toBe(true);
      expect(isReservedWord('RegExp')).toBe(true);
      expect(isReservedWord('Set')).toBe(true);
      expect(isReservedWord('Symbol')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isReservedWord('DELETE')).toBe(true);
      expect(isReservedWord('Delete')).toBe(true);
      expect(isReservedWord('record')).toBe(true);
      expect(isReservedWord('ARRAY')).toBe(true);
    });

    it('should return false for non-reserved names', () => {
      expect(isReservedWord('User')).toBe(false);
      expect(isReservedWord('UserDto')).toBe(false);
      expect(isReservedWord('myCustomType')).toBe(false);
    });
  });

  describe('renameIfReserved', () => {
    it('should append underscore suffix for reserved words', () => {
      expect(renameIfReserved('Record')).toBe('Record_');
      expect(renameIfReserved('Date')).toBe('Date_');
      expect(renameIfReserved('Array')).toBe('Array_');
      expect(renameIfReserved('delete')).toBe('delete_');
    });

    it('should return unchanged name for non-reserved words', () => {
      expect(renameIfReserved('User')).toBe('User');
      expect(renameIfReserved('Product')).toBe('Product');
      expect(renameIfReserved('UserDto')).toBe('UserDto');
    });

    it('should accept custom suffix parameter', () => {
      expect(renameIfReserved('Record', '__')).toBe('Record__');
      expect(renameIfReserved('Date', 'Safe')).toBe('DateSafe');
      expect(renameIfReserved('Promise', '_v2')).toBe('Promise_v2');
    });

    it('should not add suffix to non-reserved words even with custom suffix', () => {
      expect(renameIfReserved('User', '__')).toBe('User');
      expect(renameIfReserved('Product', 'Safe')).toBe('Product');
    });
  });
});
