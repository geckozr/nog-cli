import { IrType } from '../../ir/interfaces';

/**
 * Utility class for handling TypeScript type conversions, formatting, and file naming.
 * Used primarily by Writers to resolve type names and imports.
 */
export class TypeHelper {
  /**
   * Converts an Internal Representation (IR) type object into a valid TypeScript string representation.
   * Handles primitives, arrays, unions, intersections, and parentheses wrapping.
   *
   * @param type - The IR type object to convert.
   * @returns The TypeScript string representation (e.g., 'string[]', 'UserDto | AdminDto').
   */
  static irTypeToString(type: IrType): string {
    let baseType: string;

    if (Array.isArray(type.rawType)) {
      const separator = type.composition === 'intersection' ? ' & ' : ' | ';
      const items = type.rawType.map((t) => {
        // If it's a primitive union (like an enum), we wrap values in quotes
        if (type.composition === 'union' && type.isPrimitive) {
          return `'${t}'`;
        }
        return t;
      });
      baseType = items.join(separator);
    } else {
      baseType = type.rawType;
    }

    if (type.isArray) {
      // If the base type is complex (union/intersection), wrap it in parentheses before adding []
      if (Array.isArray(type.rawType)) {
        return `(${baseType})[]`;
      }
      return `${baseType}[]`;
    }

    return baseType;
  }

  /**
   * Determines if a given type requires an import statement.
   * Returns true for DTOs/Enums, false for primitives, void, Date, Blob, and generic Records.
   *
   * @param type - The IR type to check.
   * @returns True if the type needs to be imported.
   */
  static needsImport(type: IrType): boolean {
    const raw = type.rawType;

    // 1. Handle Unions/Intersections (Arrays)
    if (Array.isArray(raw)) {
      // If it's a union of primitives (inline enum), no import needed
      if (type.composition === 'union' && type.isPrimitive) {
        return false;
      }
      // If it contains DTOs, we need imports (handled by extracting types later)
      return true;
    }

    // 2. Handle generic Records (starts with Record<)
    // The Record itself is global, the value type inside might need import (handled by ImportHelper)
    if (typeof raw === 'string' && raw.startsWith('Record<')) {
      return false;
    }

    // 3. Handle Built-in Types (Date, Blob, void, any)
    // These might be marked as isPrimitive: false in the IR, so we check rawType directly.
    if (['Date', 'Blob', 'void', 'any'].includes(raw as string)) {
      return false;
    }

    // 4. Default rule: If it's not primitive (and not caught above), it needs an import.
    return !type.isPrimitive;
  }

  /**
   * Estrae il tipo del valore da un Record<K, V>
   * @example 'Record<string, UserRecords>' -> 'UserRecords'
   * @example 'Record<string, string>' -> 'string'
   */
  static extractRecordValueType(rawType: string): string | null {
    const match = rawType.match(/^Record<.+,\s*(.+)>$/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  }

  /**
   * Converts a PascalCase or camelCase type name to kebab-case file name.
   * Example: 'UserDto' -> 'user-dto', 'APIKey' -> 'api-key'.
   *
   * @param typeName - The name of the type/class.
   * @returns The corresponding file name in kebab-case.
   */
  static getFileName(typeName: string): string {
    return (
      typeName
        // Handle boundaries between lowercase and uppercase (e.g., UserDto -> User-Dto)
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        // Handle boundaries between consecutive uppercase and lowercase (e.g., HTTPService -> HTTP-Service)
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase()
    );
  }
}
