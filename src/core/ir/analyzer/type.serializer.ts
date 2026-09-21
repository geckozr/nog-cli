import { IrType } from '../interfaces';

/**
 * Renders an IR type as its TypeScript source form.
 *
 * Lives in the IR layer because both the converter (which inlines nested types
 * into anonymous type literals) and the generator's writers need the exact same
 * rules: enum unions get quoted, intersections use `&`, and `isArray` appends
 * `[]` with parentheses around composed members.
 *
 * @param type - The IR type to render.
 * @returns The TypeScript string representation (e.g. `string[]`, `'a' | 'b'`).
 */
export function irTypeToTypeScript(type: IrType): string {
  let baseType: string;

  if (Array.isArray(type.rawType)) {
    const separator = type.composition === 'intersection' ? ' & ' : ' | ';
    const items = type.rawType.map((t) => {
      // A primitive union is an anonymous enum, so its members are values, not type names.
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
    // A composed base type has to be parenthesised before `[]` binds to it.
    if (Array.isArray(type.rawType)) {
      return `(${baseType})[]`;
    }
    return `${baseType}[]`;
  }

  return baseType;
}
