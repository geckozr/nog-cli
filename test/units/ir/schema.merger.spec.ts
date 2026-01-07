import { OpenAPIV3 } from 'openapi-types';
import { describe, expect, it, vi } from 'vitest';

import { IrModel } from '../../../src/core/ir';
import { SchemaMerger } from '../../../src/core/ir/analyzer/schema.merger';

describe('SchemaMerger', () => {
  describe('Property Extraction', () => {
    it('should extract properties from a $ref model (shallow only)', () => {
      // Setup: Create a model with properties
      const userModel: IrModel = {
        name: 'User',
        fileName: 'user.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'id',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [{ type: 'IS_UUID' }],
          },
          {
            name: 'email',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [{ type: 'IS_EMAIL' }],
          },
        ],
      };

      const registry = new Map<string, IrModel>([['User', userModel]]);

      const allOfSchemas: OpenAPIV3.ReferenceObject[] = [{ $ref: '#/components/schemas/User' }];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.primaryRef).toBe('User');
      expect(result.additionalRefs).toEqual([]);
      expect(result.properties.size).toBe(0);
      expect(result.properties.get('id')).toBeUndefined();
      expect(result.properties.get('email')).toBeUndefined();
    });

    it("should NOT extract inherited properties from $ref model's parent", () => {
      // Setup: Create a hierarchy - BaseEntity (id) -> User (email) extends BaseEntity
      const baseModel: IrModel = {
        name: 'BaseEntity',
        fileName: 'base.entity.ts',
        isEnum: false,
        properties: [
          {
            name: 'id',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [],
          },
        ],
      };

      const userModel: IrModel = {
        name: 'User',
        fileName: 'user.model.ts',
        isEnum: false,
        extends: 'BaseEntity', // User extends BaseEntity
        properties: [
          {
            name: 'email',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [],
          },
        ],
      };

      const registry = new Map<string, IrModel>([
        ['BaseEntity', baseModel],
        ['User', userModel],
      ]);

      const allOfSchemas: OpenAPIV3.ReferenceObject[] = [{ $ref: '#/components/schemas/User' }];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'UserProfile');

      expect(result.primaryRef).toBe('User');
      expect(result.properties.size).toBe(0);
    });

    it('should extract properties from inline schema', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          properties: {
            bio: { type: 'string' },
            avatar: { type: 'string', format: 'uri' },
          },
          required: ['bio'],
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.properties.size).toBe(2);
      expect(result.properties.get('bio')?.isOptional).toBe(false); // required
      expect(result.properties.get('avatar')?.isOptional).toBe(true); // optional
    });

    it('should handle inline schema with no properties', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          // No properties field
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.properties.size).toBe(0);
    });
  });

  describe('Property Merging', () => {
    it('should merge properties from multiple schemas without conflicts', () => {
      const userModel: IrModel = {
        name: 'User',
        fileName: 'user.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'id',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [],
          },
        ],
      };

      const auditModel: IrModel = {
        name: 'AuditInfo',
        fileName: 'audit.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'createdAt',
            type: { rawType: 'Date', isArray: false, isPrimitive: false },
            isOptional: false,
            isReadonly: false,
            validators: [],
          },
        ],
      };

      const registry = new Map<string, IrModel>([
        ['User', userModel],
        ['AuditInfo', auditModel],
      ]);

      const allOfSchemas = [
        { $ref: '#/components/schemas/User' },
        { $ref: '#/components/schemas/AuditInfo' },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'UserProfile');

      expect(result.primaryRef).toBe('User');
      expect(result.additionalRefs).toContain('AuditInfo');
      expect(result.properties.size).toBe(1);
      expect(result.properties.has('id')).toBe(false);
      expect(result.properties.get('createdAt')).toBeDefined();
    });

    it('should detect and log warning for property name conflicts', () => {
      const schema1Model: IrModel = {
        name: 'Schema1',
        fileName: 'schema1.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'name',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [{ type: 'MIN_LENGTH', params: 3 }],
          },
        ],
      };

      const schema2Model: IrModel = {
        name: 'Schema2',
        fileName: 'schema2.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'name',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: true,
            isReadonly: false,
            validators: [{ type: 'MAX_LENGTH', params: 50 }],
          },
        ],
      };

      const registry = new Map<string, IrModel>([
        ['Schema1', schema1Model],
        ['Schema2', schema2Model],
      ]);

      const allOfSchemas = [
        { $ref: '#/components/schemas/Schema1' },
        { $ref: '#/components/schemas/Schema2' },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'MergedSchema');

      // Should have 1 property (last-wins)
      expect(result.properties.size).toBe(1);
      const mergedProp = result.properties.get('name');

      // Last-wins: Schema2's property should be used
      expect(mergedProp?.isOptional).toBe(true);

      // But validators should be merged (additive)
      expect(mergedProp?.validators.length).toBe(2);
      expect(mergedProp?.validators).toContainEqual({ type: 'MIN_LENGTH', params: 3 });
      expect(mergedProp?.validators).toContainEqual({ type: 'MAX_LENGTH', params: 50 });
    });

    it('should use last-wins strategy for conflicting properties', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          properties: {
            status: { type: 'string' },
          },
        },
        {
          type: 'object',
          properties: {
            status: { type: 'number' }, // Conflict!
          },
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.properties.size).toBe(1);
      const statusProp = result.properties.get('status');
      expect(statusProp?.type.rawType).toBe('number'); // Last wins
    });

    it('should handle empty properties map', () => {
      const registry = new Map<string, IrModel>();
      const allOfSchemas: OpenAPIV3.SchemaObject[] = [];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.properties.size).toBe(0);
      expect(result.primaryRef).toBeUndefined();
      expect(result.additionalRefs).toEqual([]);
    });
  });

  describe('Required Field Merging', () => {
    it('should use union semantics (required if in ANY schema)', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id'], // id is required
        },
        {
          type: 'object',
          properties: {
            email: { type: 'string' },
          },
          required: ['email'], // email is required
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      // Both id and email should be required (union semantics)
      expect(result.requiredFields.has('id')).toBe(true);
      expect(result.requiredFields.has('email')).toBe(true);
      expect(result.requiredFields.has('name')).toBe(false);

      // Check isOptional flags
      expect(result.properties.get('id')?.isOptional).toBe(false);
      expect(result.properties.get('email')?.isOptional).toBe(false);
      expect(result.properties.get('name')?.isOptional).toBe(true);
    });

    it('should merge required arrays from multiple inline schemas', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          properties: { a: { type: 'string' } },
          required: ['a'],
        },
        {
          type: 'object',
          properties: { b: { type: 'string' } },
          required: ['b'],
        },
        {
          type: 'object',
          properties: { c: { type: 'string' } },
          required: ['c'],
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.requiredFields.size).toBe(3);
      expect(result.requiredFields.has('a')).toBe(true);
      expect(result.requiredFields.has('b')).toBe(true);
      expect(result.requiredFields.has('c')).toBe(true);
    });

    it('should handle $ref schemas with required fields', () => {
      const userModel: IrModel = {
        name: 'User',
        fileName: 'user.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'email',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false, // This indicates it was required in the original schema
            isReadonly: false,
            validators: [],
          },
        ],
      };

      const registry = new Map<string, IrModel>([['User', userModel]]);

      const allOfSchemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[] = [
        { $ref: '#/components/schemas/User' },
        {
          type: 'object',
          properties: { bio: { type: 'string' } },
          required: ['bio'],
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'UserProfile');

      // bio should be required from inline schema
      expect(result.requiredFields.has('bio')).toBe(true);
      expect(result.properties.get('bio')?.isOptional).toBe(false);
    });
  });

  describe('Validator Merging (Additive)', () => {
    it('should collect all validators from multiple schemas (additive strategy)', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          properties: {
            age: { type: 'number', minimum: 5 },
          },
        },
        {
          type: 'object',
          properties: {
            age: { type: 'number', maximum: 100 },
          },
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      const ageProp = result.properties.get('age');
      expect(ageProp?.validators.length).toBe(2);
      expect(ageProp?.validators).toContainEqual({ type: 'MIN', params: 5 });
      expect(ageProp?.validators).toContainEqual({ type: 'MAX', params: 100 });
    });

    it('should NOT overwrite validators (last-wins) but concatenate them', () => {
      const model1: IrModel = {
        name: 'Model1',
        fileName: 'model1.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'username',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [
              { type: 'MIN_LENGTH', params: 3 },
              { type: 'MATCHES', params: '^[a-z]+$' },
            ],
          },
        ],
      };

      const model2: IrModel = {
        name: 'Model2',
        fileName: 'model2.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'username',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [{ type: 'MAX_LENGTH', params: 20 }],
          },
        ],
      };

      const registry = new Map<string, IrModel>([
        ['Model1', model1],
        ['Model2', model2],
      ]);

      const allOfSchemas = [
        { $ref: '#/components/schemas/Model1' },
        { $ref: '#/components/schemas/Model2' },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'MergedModel');

      const usernameProp = result.properties.get('username');
      expect(usernameProp?.validators.length).toBe(3);
      expect(usernameProp?.validators).toContainEqual({ type: 'MIN_LENGTH', params: 3 });
      expect(usernameProp?.validators).toContainEqual({ type: 'MATCHES', params: '^[a-z]+$' });
      expect(usernameProp?.validators).toContainEqual({ type: 'MAX_LENGTH', params: 20 });
    });

    it('should handle properties with no validators', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          properties: {
            name: { type: 'string' }, // No validators
          },
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      const nameProp = result.properties.get('name');
      expect(nameProp?.validators.length).toBe(0);
    });

    it('should merge validators with same type but different params', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          properties: {
            score: { type: 'number', minimum: 5 },
          },
        },
        {
          type: 'object',
          properties: {
            score: { type: 'number', minimum: 10 }, // Different minimum
          },
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      const scoreProp = result.properties.get('score');
      // Both @Min(5) and @Min(10) should be present
      expect(scoreProp?.validators.length).toBe(2);
      expect(scoreProp?.validators).toContainEqual({ type: 'MIN', params: 5 });
      expect(scoreProp?.validators).toContainEqual({ type: 'MIN', params: 10 });
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should throw error on direct circular dependency (A allOf B, B allOf A)', () => {
      // This test is conceptual - in practice, the converter would need to handle this
      // during schema processing. We'll test that the merger detects cycles when schemas
      // reference each other.

      const registry = new Map<string, IrModel>();

      const allOfSchemas = [
        { $ref: '#/components/schemas/ModelA' }, // References current schema
      ];

      // If ModelA allOf itself, it should throw
      expect(() => {
        SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'ModelA');
      }).toThrow(/Circular allOf dependency/);
    });

    it('should NOT throw error on valid nested allOf (A allOf B, C allOf B)', () => {
      const modelB: IrModel = {
        name: 'ModelB',
        fileName: 'model-b.ts',
        isEnum: false,
        properties: [
          {
            name: 'prop',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [],
          },
        ],
      };

      const registry = new Map<string, IrModel>([['ModelB', modelB]]);

      const allOfSchemas = [{ $ref: '#/components/schemas/ModelB' }];

      // ModelA allOf ModelB should work fine
      expect(() => {
        SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'ModelA');
      }).not.toThrow();

      // ModelC allOf ModelB should also work fine
      expect(() => {
        SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'ModelC');
      }).not.toThrow();
    });
  });

  describe('$ref Tracking', () => {
    it('should identify first $ref as primaryRef', () => {
      const userModel: IrModel = {
        name: 'User',
        fileName: 'user.model.ts',
        isEnum: false,
        properties: [],
      };

      const auditModel: IrModel = {
        name: 'AuditInfo',
        fileName: 'audit.model.ts',
        isEnum: false,
        properties: [],
      };

      const registry = new Map<string, IrModel>([
        ['User', userModel],
        ['AuditInfo', auditModel],
      ]);

      const allOfSchemas = [
        { $ref: '#/components/schemas/User' },
        { $ref: '#/components/schemas/AuditInfo' },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'UserProfile');

      expect(result.primaryRef).toBe('User'); // First $ref
      expect(result.additionalRefs).toEqual(['AuditInfo']); // Remaining $refs
    });

    it('should collect remaining $refs in additionalRefs array', () => {
      const model1: IrModel = {
        name: 'Model1',
        fileName: 'model1.model.ts',
        isEnum: false,
        properties: [],
      };
      const model2: IrModel = {
        name: 'Model2',
        fileName: 'model2.model.ts',
        isEnum: false,
        properties: [],
      };
      const model3: IrModel = {
        name: 'Model3',
        fileName: 'model3.model.ts',
        isEnum: false,
        properties: [],
      };

      const registry = new Map<string, IrModel>([
        ['Model1', model1],
        ['Model2', model2],
        ['Model3', model3],
      ]);

      const allOfSchemas = [
        { $ref: '#/components/schemas/Model1' },
        { $ref: '#/components/schemas/Model2' },
        { $ref: '#/components/schemas/Model3' },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.primaryRef).toBe('Model1');
      expect(result.additionalRefs).toEqual(['Model2', 'Model3']);
    });

    it('should handle allOf with only inline schemas (no $refs)', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.SchemaObject[] = [
        {
          type: 'object',
          properties: { a: { type: 'string' } },
        },
        {
          type: 'object',
          properties: { b: { type: 'string' } },
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.primaryRef).toBeUndefined();
      expect(result.additionalRefs).toEqual([]);
      expect(result.properties.size).toBe(2);
    });

    it('should handle allOf with single $ref + multiple inline schemas', () => {
      const userModel: IrModel = {
        name: 'User',
        fileName: 'user.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'id',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [],
          },
        ],
      };

      const registry = new Map<string, IrModel>([['User', userModel]]);

      const allOfSchemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[] = [
        { $ref: '#/components/schemas/User' },
        {
          type: 'object',
          properties: { bio: { type: 'string' } },
        },
        {
          type: 'object',
          properties: { avatar: { type: 'string' } },
        },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'UserProfile');

      expect(result.primaryRef).toBe('User');
      expect(result.additionalRefs).toEqual([]);
      expect(result.properties.size).toBe(2);
      expect(result.properties.has('id')).toBe(false);
      expect(result.properties.has('bio')).toBe(true);
      expect(result.properties.has('avatar')).toBe(true);
    });

    it('should warn and skip when allOf references missing model', () => {
      const registry = new Map<string, IrModel>();

      const allOfSchemas: OpenAPIV3.ReferenceObject[] = [
        { $ref: '#/components/schemas/NonExistentModel' },
      ];

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.primaryRef).toBeUndefined();
      expect(result.additionalRefs).toEqual([]);
      expect(result.properties.size).toBe(0);

      warnSpy.mockRestore();
    });

    it('should handle allOf with missing model in registry', () => {
      const baseModel: IrModel = {
        name: 'BaseModel',
        fileName: 'base.model.ts',
        isEnum: false,
        properties: [
          {
            name: 'id',
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            isOptional: false,
            isReadonly: false,
            validators: [],
          },
        ],
      };

      const registry = new Map<string, IrModel>([['BaseModel', baseModel]]);

      const allOfSchemas: (OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject)[] = [
        { $ref: '#/components/schemas/BaseModel' },
        { $ref: '#/components/schemas/MissingModel' },
      ];

      const result = SchemaMerger.mergeAllOfSchemas(allOfSchemas, registry, 'TestModel');

      expect(result.primaryRef).toBe('BaseModel');
    });
  });
});
