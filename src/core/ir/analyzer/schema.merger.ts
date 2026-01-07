import { OpenAPIV3 } from 'openapi-types';

import { Logger } from '../../../utils/logger';
import { IrModel, IrProperty, IrValidator } from '../interfaces';
import { TypeMapper } from './type.mapper';

/**
 * Result structure of a merge operation on 'allOf' schemas.
 */
export interface AllOfMergeResult {
  /** Map of flattened properties indexed by property name */
  properties: Map<string, IrProperty>;
  /** Set of field names that are required in the resulting schema */
  requiredFields: Set<string>;
  /** Name of the primary parent model (first $ref) used for class inheritance */
  primaryRef?: string;
  /** Names of additional mixins flattened into this schema */
  additionalRefs: string[];
}

// Helper Interface to pass state around private methods
interface MergeContext {
  properties: Map<string, IrProperty>;
  requiredFields: Set<string>;
  additionalRefs: string[];
  visitedRefs: Set<string>;
  registry: Map<string, IrModel>;
  currentSchemaKey: string;
  primaryRef?: string;
  parentModel?: IrModel;
}

/**
 * Advanced Schema Composition Engine.
 *
 * Handles the complexity of OpenAPI 'allOf' (polymorphism & composition) by implementing
 * a "Smart Flattening" strategy suitable for TypeScript class generation.
 */
export class SchemaMerger {
  /**
   * Merges a list of schemas (defined in an 'allOf' array) into a unified property set.
   *
   * @param allOfSchemas - The array of schema objects or references to merge.
   * @param registry - The global model registry to resolve references.
   * @param currentSchemaKey - The name of the schema currently being processed (for cycle detection).
   * @returns A result object containing the merged properties and inheritance metadata.
   * @throws {Error} If a circular dependency is detected in the inheritance chain.
   */
  static mergeAllOfSchemas(
    allOfSchemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
    registry: Map<string, IrModel>,
    currentSchemaKey: string,
  ): AllOfMergeResult {
    const context: MergeContext = {
      properties: new Map(),
      requiredFields: new Set(),
      additionalRefs: [],
      visitedRefs: new Set([currentSchemaKey]), // Start tracking cycles immediately
      registry,
      currentSchemaKey,
    };

    const hasInlineSchemas = allOfSchemas.some((s) => !('$ref' in s));

    // Iterate through all schemas in the 'allOf' array
    for (let i = 0; i < allOfSchemas.length; i++) {
      const subSchema = allOfSchemas[i];

      if ('$ref' in subSchema) {
        this.processRefSchema(subSchema, i, hasInlineSchemas, context);
      } else {
        this.processInlineSchema(subSchema, context);
      }
    }

    // Post-processing: Apply 'required' status to collected properties
    this.applyRequiredStatus(context);

    return {
      properties: context.properties,
      requiredFields: context.requiredFields,
      primaryRef: context.primaryRef,
      additionalRefs: context.additionalRefs,
    };
  }

  // ===========================================================================
  // Internal Processors
  // ===========================================================================

  private static processRefSchema(
    schema: OpenAPIV3.ReferenceObject,
    index: number,
    hasInlineSchemas: boolean,
    ctx: MergeContext,
  ): void {
    const refKey = schema.$ref.split('/').pop() || '';

    if (ctx.visitedRefs.has(refKey)) {
      throw new Error(
        `Circular allOf dependency detected: '${ctx.currentSchemaKey}' references '${refKey}'.`,
      );
    }

    const refModel = ctx.registry.get(refKey);
    if (!refModel) {
      Logger.warn(`SchemaMerger: Referenced model '${refKey}' not found in registry.`);
      return;
    }

    // Strategy: First $ref is the parent (extends), others are Mixins (flattened).
    if (index === 0) {
      ctx.primaryRef = refModel.name;
      ctx.parentModel = refModel;
    } else {
      ctx.additionalRefs.push(refModel.name);
    }

    // Decide if we need to flatten the properties of this ref into the current model.
    // FIX: We ONLY flatten if index > 0 (Mixins).
    // The first element (index 0) becomes the parent class via 'extends', so we
    // do NOT copy its properties to avoid shadowing/duplication in the generated class.
    const shouldFlatten = index > 0;

    if (shouldFlatten) {
      const extractedProps = this.extractPropertiesFromRef(refModel);
      this.mergePropertiesIntoMap(ctx.properties, extractedProps, refModel.name, ctx);
    }
  }

  private static processInlineSchema(schema: OpenAPIV3.SchemaObject, ctx: MergeContext): void {
    // 1. Extract properties
    const extractedProps = this.extractPropertiesFromInlineSchema(schema, ctx.registry);
    this.mergePropertiesIntoMap(ctx.properties, extractedProps, 'Inline Schema', ctx);

    // 2. Collect required fields (Union semantics: if required here, it becomes required in result)
    if (Array.isArray(schema.required)) {
      schema.required.forEach((field) => ctx.requiredFields.add(field));
    }
  }

  // ===========================================================================
  // Extraction Logic
  // ===========================================================================

  /**
   * Performs a shallow extraction of properties from a referenced model.
   * "Shallow" means it takes properties defined IN that model, ignoring its own parent.
   */
  private static extractPropertiesFromRef(model: IrModel): IrProperty[] {
    return model.properties.map((prop) => ({
      ...prop,
      // Deep copy validators to prevent mutation side-effects
      validators: [...prop.validators],
    }));
  }

  private static extractPropertiesFromInlineSchema(
    schema: OpenAPIV3.SchemaObject,
    registry: Map<string, IrModel>,
  ): IrProperty[] {
    const properties: IrProperty[] = [];

    if (!schema.properties) return properties;

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const propSchemaObj = propSchema as OpenAPIV3.SchemaObject;
      const typeInfo = TypeMapper.map(propSchema, registry);

      // Reuse centralized logic from TypeMapper
      let discriminator: IrProperty['discriminator'] = undefined;
      if (propSchemaObj.oneOf && propSchemaObj.oneOf.length > 0) {
        const oneOfRefs = this.extractOneOfReferences(propSchemaObj.oneOf, registry);
        discriminator = TypeMapper.extractDiscriminatorFromSchema(propSchemaObj, oneOfRefs);
      }

      // Determine optionality locally (within this inline block)
      // The global merge context will later enforce 'required' status if defined elsewhere
      const isLocallyRequired =
        Array.isArray(schema.required) && schema.required.includes(propName);

      properties.push({
        name: propName,
        type: typeInfo,
        isOptional: !isLocallyRequired,
        isReadonly: propSchemaObj.readOnly || false,
        description: propSchemaObj.description,
        validators: TypeMapper.extractValidators(propSchemaObj),
        discriminator,
      });
    }

    return properties;
  }

  // ===========================================================================
  // Merge Utilities
  // ===========================================================================

  private static mergePropertiesIntoMap(
    targetMap: Map<string, IrProperty>,
    sourceProps: IrProperty[],
    sourceName: string,
    ctx: MergeContext,
  ): void {
    for (const prop of sourceProps) {
      const existing = targetMap.get(prop.name);

      // Merge validators: Start with parent's validators if available, then existing, then new.
      // Note: This logic assumes 'ctx.parentModel' is relevant only if we are overriding a parent property.
      // But typically, we merge validators from the same property found in different mixins.
      const parentValidators =
        ctx.parentModel?.properties.find((p) => p.name === prop.name)?.validators || [];
      const existingValidators = existing?.validators || [];

      const mergedValidators = this.mergeValidators(
        [...parentValidators, ...existingValidators],
        prop.validators,
      );

      if (existing) {
        Logger.warn(
          `Property collision: '${prop.name}' in '${ctx.currentSchemaKey}' is being overwritten by '${sourceName}'.`,
        );
      }

      targetMap.set(prop.name, {
        ...prop,
        validators: mergedValidators,
      });
    }
  }

  private static mergeValidators(v1: IrValidator[], v2: IrValidator[]): IrValidator[] {
    const combined = [...v1, ...v2];
    const unique = new Map<string, IrValidator>();

    for (const v of combined) {
      // Create a signature to dedup validators (e.g. "MIN:{min:5}")
      const signature = `${v.type}:${JSON.stringify(v.params ?? '')}`;
      if (!unique.has(signature)) {
        unique.set(signature, v);
      }
    }
    return Array.from(unique.values());
  }

  private static applyRequiredStatus(ctx: MergeContext): void {
    for (const [propName, property] of ctx.properties) {
      // If the field is in the global 'required' set (accumulated from all schemas), force it.
      if (ctx.requiredFields.has(propName)) {
        property.isOptional = false;
        // Also add IS_NOT_EMPTY validator if not present
        if (!property.validators.some((v) => v.type === 'IS_NOT_EMPTY')) {
          property.validators.push({ type: 'IS_NOT_EMPTY' });
        }
      }
    }
  }

  private static extractOneOfReferences(
    oneOf: (OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject)[],
    registry: Map<string, IrModel>,
  ): string[] {
    const refs: string[] = [];
    for (const item of oneOf) {
      if ('$ref' in item) {
        const refKey = item.$ref.split('/').pop() || '';
        const model = registry.get(refKey);
        refs.push(model ? model.name : refKey);
      }
    }
    return refs;
  }
}
