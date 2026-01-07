import { OpenAPIV3 } from 'openapi-types';

import { IrModel, IrType, IrValidator } from '../interfaces';

/**
 * Utility class responsible for mapping OpenAPI schemas to Internal Representation (IR) types.
 *
 * This class acts as a bridge between the raw OpenAPI definitions and the TypeScript-ready
 * internal structures, handling complex scenarios like Polymorphism (oneOf),
 * Inheritance (allOf), and generic types (arrays, maps).
 */
export class TypeMapper {
  /**
   * Maps an OpenAPI schema object or reference to an IR Type definition.
   *
   * @param schema - The OpenAPI schema or reference object.
   * @param registry - The global model registry used to resolve references.
   * @returns The parsed Internal Representation type.
   */
  static map(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    registry: Map<string, IrModel>,
  ): IrType {
    // Handle undefined or null schema
    if (!schema) {
      return { rawType: 'any', isArray: false, isPrimitive: true };
    }

    // 1. Reference Handling ($ref)
    if ('$ref' in schema) {
      return this.handleReference(schema, registry);
    }

    // 2. Intersection / Inheritance (allOf)
    if ('allOf' in schema && schema.allOf && schema.allOf.length > 0) {
      return this.handleAllOf(schema.allOf, registry);
    }

    // 3. Union Types (oneOf)
    if ('oneOf' in schema && schema.oneOf && schema.oneOf.length > 0) {
      return this.handleOneOf(schema.oneOf, registry);
    }

    // Safe cast since we handled the ReferenceObject case above
    const schemaObj = schema as OpenAPIV3.SchemaObject;

    // 4. Arrays
    if (schemaObj.type === 'array') {
      return this.handleArray(schemaObj as OpenAPIV3.ArraySchemaObject, registry);
    }

    // 5. Objects / Dictionaries / Maps
    if (schemaObj.type === 'object') {
      return this.handleObject(schemaObj, registry);
    }

    // 6. Primitives (String, Number, Boolean, Enums)
    if (this.isPrimitiveType(schemaObj.type)) {
      return this.handlePrimitive(schemaObj);
    }

    // Fallback
    return { rawType: 'any', isArray: false, isPrimitive: true };
  }

  // ===========================================================================
  // Specific Handlers
  // ===========================================================================

  private static handleReference(
    schema: OpenAPIV3.ReferenceObject,
    registry: Map<string, IrModel>,
  ): IrType {
    const refKey = schema.$ref.split('/').pop() || '';
    // Resolve the model name from registry to handle potential renames (e.g. reserved words)
    const model = registry.get(refKey);

    return {
      rawType: model ? model.name : refKey,
      isArray: false,
      isPrimitive: false,
    };
  }

  private static handleAllOf(
    allOf: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
    registry: Map<string, IrModel>,
  ): IrType {
    // Optimization: If allOf has only one item, it's often a wrapper around a ref
    if (allOf.length === 1) {
      return this.map(allOf[0], registry);
    }

    // Collect all references involved in the intersection
    const refs: string[] = [];

    for (const item of allOf) {
      if ('$ref' in item) {
        const refKey = item.$ref.split('/').pop() || '';
        const model = registry.get(refKey);
        refs.push(model ? model.name : refKey);
      }
    }

    if (refs.length > 0) {
      return {
        rawType: refs.length > 1 ? refs : refs[0],
        isArray: false,
        isPrimitive: false,
        composition: refs.length > 1 ? 'intersection' : undefined,
      };
    }

    // Fallback: if no refs, try to map the first typed element (common in some spec variations)
    for (const item of allOf) {
      if ('type' in item) {
        return this.map(item, registry);
      }
    }

    return { rawType: 'any', isArray: false, isPrimitive: true };
  }

  private static handleOneOf(
    oneOf: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
    registry: Map<string, IrModel>,
  ): IrType {
    const types: string[] = [];

    for (const item of oneOf) {
      if ('$ref' in item) {
        const refKey = item.$ref.split('/').pop() || '';
        const model = registry.get(refKey);
        types.push(model ? model.name : refKey);
      } else {
        const mapped = this.map(item, registry);
        const raw = Array.isArray(mapped.rawType) ? mapped.rawType.join(' | ') : mapped.rawType;
        types.push(raw);
      }
    }

    if (types.length === 1) {
      // Only one type, treat as simple type
      const typeName = types[0];
      const isPrimitive = ['string', 'number', 'boolean'].includes(typeName);
      return { rawType: typeName, isArray: false, isPrimitive };
    }

    return {
      rawType: types,
      isArray: false,
      // It is primitive only if ALL subtypes are primitives
      isPrimitive: types.every((t) => ['string', 'number', 'boolean'].includes(t)),
      composition: 'union',
    };
  }

  private static handleArray(
    schema: OpenAPIV3.ArraySchemaObject,
    registry: Map<string, IrModel>,
  ): IrType {
    if (!schema.items) {
      return { rawType: 'any[]', isArray: true, isPrimitive: false };
    }

    const itemType = this.map(schema.items, registry);

    return {
      rawType: itemType.rawType,
      isArray: true,
      isPrimitive: itemType.isPrimitive,
      composition: itemType.composition,
    };
  }

  private static handleObject(
    schema: OpenAPIV3.SchemaObject,
    registry: Map<string, IrModel>,
  ): IrType {
    // Handle 'additionalProperties' which translates to TypeScript Record<string, T>
    if (schema.additionalProperties) {
      if (schema.additionalProperties === true) {
        return { rawType: 'Record<string, any>', isArray: false, isPrimitive: false };
      }

      if (typeof schema.additionalProperties === 'object') {
        const valueType = this.map(schema.additionalProperties, registry);
        // If the value type is complex (e.g. array or union), simple string interpolation might be tricky,
        // but for now strict rawType usage is assumed sufficient.
        const valueTypeName = Array.isArray(valueType.rawType)
          ? valueType.rawType.join(' | ')
          : valueType.rawType;

        return {
          rawType: `Record<string, ${valueTypeName}>`,
          isArray: false,
          isPrimitive: false,
        };
      }
    }

    // Generic object without specific properties definition
    return { rawType: 'any', isArray: false, isPrimitive: true };
  }

  private static handlePrimitive(schema: OpenAPIV3.SchemaObject): IrType {
    if (schema.type === 'string') {
      // 1. Enum Handling
      if (schema.enum) {
        // Convention: If title is present, we assume it's a reference to a named Enum
        if (schema.title) {
          return { rawType: schema.title, isArray: false, isPrimitive: false };
        }
        // Anonymous Enum: Union of string literal types
        const enumValues = schema.enum.map((val) => String(val));
        return {
          rawType: enumValues,
          isArray: false,
          isPrimitive: true,
          composition: 'union',
        };
      }

      // 2. Date / Binary handling
      switch (schema.format) {
        case 'date':
        case 'date-time':
          return { rawType: 'Date', isArray: false, isPrimitive: false };
        case 'binary':
          return { rawType: 'Blob', isArray: false, isPrimitive: false };
      }

      return { rawType: 'string', isArray: false, isPrimitive: true };
    }

    if (schema.type === 'integer' || schema.type === 'number') {
      return { rawType: 'number', isArray: false, isPrimitive: true };
    }

    if (schema.type === 'boolean') {
      return { rawType: 'boolean', isArray: false, isPrimitive: true };
    }

    return { rawType: 'any', isArray: false, isPrimitive: true };
  }

  private static isPrimitiveType(type?: string): boolean {
    return type === 'string' || type === 'number' || type === 'integer' || type === 'boolean';
  }

  // ===========================================================================
  // Helper Extractors
  // ===========================================================================

  /**
   * Extracts discriminator configuration from a schema.
   * Uses explicit mapping if available, otherwise falls back to implicit mapping from oneOf refs.
   */
  static extractDiscriminatorFromSchema(
    schema: OpenAPIV3.SchemaObject,
    oneOfRefs?: string[],
  ): { propertyName: string; mapping: Record<string, string> } | undefined {
    if (!schema.discriminator?.propertyName) {
      return undefined;
    }

    const propertyName = schema.discriminator.propertyName;
    const mapping: Record<string, string> = {};

    // Strategy 1: Explicit Mapping
    if (schema.discriminator.mapping) {
      Object.entries(schema.discriminator.mapping).forEach(([key, ref]) => {
        const schemaName = ref.split('/').pop() || ref;
        mapping[key] = schemaName;
      });
    } else if (oneOfRefs && oneOfRefs.length > 0) {
      // Strategia 2: Usa schema name come valore di discriminatore (implicit mapping)
      for (const ref of oneOfRefs) {
        // Assumption: discriminator value matches the schema name (case-insensitive usually preferred in convention)
        mapping[ref.toLowerCase()] = ref;
      }
    }

    return { propertyName, mapping };
  }

  /**
   * Maps OpenAPI validation rules to `class-validator` decorators.
   */
  static extractValidators(schema: OpenAPIV3.SchemaObject): IrValidator[] {
    const validators: IrValidator[] = [];

    // String constraints
    if (schema.minLength !== undefined)
      validators.push({ type: 'MIN_LENGTH', params: schema.minLength });
    if (schema.maxLength !== undefined)
      validators.push({ type: 'MAX_LENGTH', params: schema.maxLength });
    if (schema.pattern) validators.push({ type: 'MATCHES', params: schema.pattern });

    // Numeric constraints
    if (schema.minimum !== undefined) validators.push({ type: 'MIN', params: schema.minimum });
    if (schema.maximum !== undefined) validators.push({ type: 'MAX', params: schema.maximum });

    // Formats
    const formatMap: Record<string, IrValidator['type']> = {
      email: 'IS_EMAIL',
      uuid: 'IS_UUID',
      'date-time': 'IS_DATE',
      uri: 'IS_URL',
    };

    if (schema.format && formatMap[schema.format]) {
      validators.push({ type: formatMap[schema.format] });
    }

    // Nullability
    if (schema.nullable === false) {
      validators.push({ type: 'IS_NOT_EMPTY' });
    }

    return validators;
  }
}
