/**
 * String casing utility functions for converting between different naming conventions.
 * Used throughout the generator to transform OpenAPI identifiers into idiomatic TypeScript names.
 */

const WORD_SEPARATOR = /[^a-zA-Z0-9]+|(?=[A-Z])/;
const NOT_ALPHANUMERIC = /[^a-zA-Z0-9_]/g;
const LEADING_DIGIT = /^[0-9]/;
const KEBAB_CAMEL_CASE = /([a-z0-9])([A-Z])/g;
const KEBAB_ACRONYM = /([A-Z])([A-Z][a-z])/g;

// TypeScript reserved keywords and global objects that cannot be used as identifiers
const RESERVED_KEYWORDS = new Set([
  'any',
  'as',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'is',
  'let',
  'module',
  'namespace',
  'new',
  'null',
  'number',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'require',
  'return',
  'set',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  // Global objects that should not be used as model names
  'array',
  'date',
  'error',
  'map',
  'object',
  'promise',
  'record',
  'regexp',
  'set',
  'symbol',
]);

/**
 * Converts a string to camelCase.
 * Examples:
 *   - "hello-world" => "helloWorld"
 *   - "HelloWorld" => "helloWorld"
 *   - "hello_world" => "helloWorld"
 *
 * @param str - The string to convert
 * @returns The string in camelCase format
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Converts a string to PascalCase.
 * Examples:
 *   - "hello-world" => "HelloWorld"
 *   - "hello_world" => "HelloWorld"
 *   - "hello world" => "HelloWorld"
 *
 * @param str - The string to convert
 * @returns The string in PascalCase format
 */
export function toPascalCase(str: string): string {
  return str
    .split(WORD_SEPARATOR)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Converts a string to kebab-case.
 * Examples:
 *   - "HelloWorld" => "hello-world"
 *   - "helloWorld" => "hello-world"
 *   - "hello_world" => "hello-world"
 *
 * @param str - The string to convert
 * @returns The string in kebab-case format
 */
export function toKebabCase(str: string): string {
  return str
    .replace(KEBAB_ACRONYM, '$1-$2') // Handle "APIUser" -> "API-User"
    .replace(KEBAB_CAMEL_CASE, '$1-$2') // Handle "camelCase" -> "camel-Case"
    .replace(/[^a-zA-Z0-9]+/g, '-') // Replace non-alphanumeric characters with dashes
    .replace(/-{2,}/g, '-') // Replace multiple dashes with a single dash
    .replace(/^-+|-+$/g, '') // Trim leading/trailing dashes
    .toLowerCase();
}

/**
 * Sanitizes a string to be a valid TypeScript identifier.
 * Removes or replaces invalid characters and handles edge cases.
 * Examples:
 *   - "User@Admin" => "UserAdmin"
 *   - "Data#Schema" => "DataSchema"
 *   - "test.object" => "TestObject"
 *   - "123Number" => "_123Number"
 *   - "$ref" => "Ref"
 *   - "#tag" => "Tag"
 *
 * @param str - The string to sanitize
 * @returns A valid TypeScript identifier
 * TODO: check if this function is useful or could be moved to the other casing functions
 */
export function sanitizeName(str: string): string {
  // Remove or replace invalid characters (keep only alphanumeric and underscore)
  let sanitized = str.replace(NOT_ALPHANUMERIC, '');

  if (!sanitized) return 'UnknownType';

  // If string starts with a digit, prefix with underscore
  if (LEADING_DIGIT.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  // If string is empty after sanitization, return a default
  if (RESERVED_KEYWORDS.has(sanitized)) {
    return `_${sanitized}`;
  }

  return sanitized;
}

export function generateOperationId(method: string, path: string): string {
  const cleanPath = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith('{') && segment.endsWith('}')) {
        return 'By' + toPascalCase(segment.slice(1, -1));
      }
      return toPascalCase(segment);
    })
    .join('');

  return toCamelCase(method.toLowerCase() + cleanPath);
}

/**
 * Checks if a name is a reserved word (TypeScript keyword or global object).
 * Case-insensitive check.
 *
 * @param name - The name to check
 * @returns true if the name is reserved, false otherwise
 */
export function isReservedWord(name: string): boolean {
  return RESERVED_KEYWORDS.has(name.toLowerCase());
}

/**
 * Renames a name if it's a reserved word by appending a suffix.
 * If the name is not reserved, returns it unchanged.
 *
 * @param name - The name to check and potentially rename
 * @param suffix - The suffix to append (default: '_')
 * @returns The renamed name if reserved, otherwise the original name
 */
export function renameIfReserved(name: string, suffix: string = '_'): string {
  if (isReservedWord(name)) {
    return `${name}${suffix}`;
  }
  return name;
}
