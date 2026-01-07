import { OpenAPIV3 } from 'openapi-types';
import { describe, expect, it } from 'vitest';

import { IrModel, IrType, TypeMapper } from '../../../src/core/ir';

describe('TypeMapper', () => {
  const registry = new Map<string, IrModel>([
    ['User', { name: 'User', properties: [], isEnum: false, fileName: 'user.dto' }],
    ['Base', { name: 'Base', properties: [], isEnum: false, fileName: 'base.dto' }],
    ['First', { name: 'First', isEnum: false, properties: [], fileName: 'first.dto' }],
    ['Second', { name: 'Second', isEnum: false, properties: [], fileName: 'second.dto' }],
  ]);

  describe('map', () => {
    it('should map null or undefined schema', () => {
      const iType = TypeMapper.map(undefined as any, new Map());

      expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
    });

    describe('$ref handling', () => {
      it('should extract $ref types', () => {
        const schema = { $ref: '#/components/schemas/User' };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({ rawType: 'User', isArray: false, isPrimitive: false });

        // Missing model in registry
        const schemaUnknownRef = { $ref: '#/components/schemas/Unknown' };
        const iTypeUnknown = TypeMapper.map(schemaUnknownRef, registry);

        expect(iTypeUnknown).toEqual({ rawType: 'Unknown', isArray: false, isPrimitive: false });
      });
    });

    describe('allOf handling', () => {
      it('should handle allOf with $ref', () => {
        const schema: OpenAPIV3.SchemaObject = {
          allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'object', properties: {} }],
        };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({ rawType: 'Base', isArray: false, isPrimitive: false });
      });

      it('should handle allOf with single item', () => {
        const schema: OpenAPIV3.SchemaObject = {
          allOf: [{ $ref: '#/components/schemas/Single' }],
        };
        const iType = TypeMapper.map(schema, registry);
        expect(iType).toEqual({ rawType: 'Single', isArray: false, isPrimitive: false });
      });

      it('should handle allOf without $ref', () => {
        const schema: OpenAPIV3.SchemaObject = {
          allOf: [{ type: 'string' }, { type: 'number' }],
        };
        const iType = TypeMapper.map(schema, registry);
        expect(iType).toEqual({ rawType: 'string', isArray: false, isPrimitive: true });
      });

      it('should handle multiple $ref in allOf', () => {
        const schema: OpenAPIV3.SchemaObject = {
          allOf: [{ $ref: '#/components/schemas/First' }, { $ref: '#/components/schemas/Second' }],
        };

        const iType = TypeMapper.map(schema, registry);
        expect(iType).toEqual({
          rawType: ['First', 'Second'],
          isArray: false,
          isPrimitive: false,
          composition: 'intersection',
        });
      });
    });

    describe('arrays handling', () => {
      it('should handle arrays of primitive types', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'array',
          items: { type: 'string' },
        };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({ rawType: 'string', isArray: true, isPrimitive: true });
      });

      it('should handle arrays of multiple primitives and $refs', async () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'array',
          items: {
            oneOf: [{ type: 'string' }, { type: 'boolean' }, { $ref: '#/components/schemas/User' }],
          },
        };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({
          rawType: ['string', 'boolean', 'User'],
          isArray: true,
          isPrimitive: false,
          composition: 'union',
        });
      });

      it('should handle arrays without items', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'array',
          items: {},
        };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({ rawType: 'any', isArray: true, isPrimitive: true });
      });
    });

    describe('primitive types handling', () => {
      it('should handle primitive types', () => {
        const primitiveTypesMap: Map<OpenAPIV3.SchemaObject, IrType> = new Map([
          [{ type: 'string' }, { rawType: 'string', isArray: false, isPrimitive: true }],
          [{ type: 'number' }, { rawType: 'number', isArray: false, isPrimitive: true }],
          [{ type: 'boolean' }, { rawType: 'boolean', isArray: false, isPrimitive: true }],
          [{ type: 'integer' }, { rawType: 'number', isArray: false, isPrimitive: true }],
          [
            { type: 'string', format: 'date' },
            { rawType: 'Date', isArray: false, isPrimitive: false },
          ],
          [
            { type: 'string', format: 'date-time' },
            { rawType: 'Date', isArray: false, isPrimitive: false },
          ],
          [
            { type: 'string', format: 'binary' },
            { rawType: 'Buffer', isArray: false, isPrimitive: false },
          ],
          [
            { type: undefined, format: 'null' },
            { rawType: 'any', isArray: false, isPrimitive: true },
          ],
        ]);

        for (const [schema, expectedType] of primitiveTypesMap) {
          const iType = TypeMapper.map(schema, registry);

          expect(iType).toEqual(expectedType);
        }
      });
    });

    describe('objects handling', () => {
      it('should default to any for object type without properties', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'object',
        };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
      });

      it('should default to any for empty schema object', () => {
        const schema: OpenAPIV3.SchemaObject = {};

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
      });

      it('should handle object with additionalProperties as true', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'object',
          additionalProperties: true,
        };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({
          rawType: 'Record<string, any>',
          isArray: false,
          isPrimitive: false,
        });
      });

      it('should handle object with additionalProperties as schema', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'object',
          additionalProperties: { type: 'string' },
        };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({
          rawType: 'Record<string, string>',
          isArray: false,
          isPrimitive: false,
        });
      });

      it('should handle object with additionalProperties as false', () => {
        const schema: OpenAPIV3.SchemaObject = {
          type: 'object',
          additionalProperties: false,
        };

        const iType = TypeMapper.map(schema, registry);

        expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
      });
    });

    it('should default to any for unknown schemas', () => {
      const schema: OpenAPIV3.SchemaObject = { format: 'unknownFormat' };

      const iType = TypeMapper.map(schema, registry);

      expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
    });

    describe('oneOf handling', () => {
      it('should handle oneOf with multiple $ref', () => {
        const schema: OpenAPIV3.SchemaObject = {
          oneOf: [{ $ref: '#/components/schemas/First' }, { $ref: '#/components/schemas/Second' }],
        };

        const iType = TypeMapper.map(schema, registry);
        expect(iType).toEqual({
          rawType: ['First', 'Second'],
          isArray: false,
          isPrimitive: false,
          composition: 'union',
        });
      });

      it('should handle oneOf with single $ref', () => {
        const schema: OpenAPIV3.SchemaObject = {
          oneOf: [{ $ref: '#/components/schemas/User' }],
        };

        const iType = TypeMapper.map(schema, registry);
        expect(iType).toEqual({ rawType: 'User', isArray: false, isPrimitive: false });
      });

      it('should handle oneOf with primitive types', () => {
        const schema: OpenAPIV3.SchemaObject = {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        };

        const iType = TypeMapper.map(schema, registry);
        expect(iType).toEqual({
          rawType: ['string', 'number'],
          isArray: false,
          isPrimitive: true,
          composition: 'union',
        });
      });

      it('should handle oneOf mixed $ref and types', () => {
        const schema: OpenAPIV3.SchemaObject = {
          oneOf: [{ $ref: '#/components/schemas/User' }, { type: 'string' }],
        };

        const iType = TypeMapper.map(schema, registry);
        expect(iType).toEqual({
          rawType: ['User', 'string'],
          isArray: false,
          isPrimitive: false,
          composition: 'union',
        });
      });
    });
  });

  describe('extractValidators', () => {
    it('should extract validators from schema', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'string',
        format: 'email',
        minLength: 5,
        maxLength: 50,
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      };

      const validators = TypeMapper.extractValidators(schema);

      expect(validators).toEqual([
        { type: 'MIN_LENGTH', params: 5 },
        { type: 'MAX_LENGTH', params: 50 },
        { type: 'MATCHES', params: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' },
        { type: 'IS_EMAIL' },
      ]);

      const anotherSchema: OpenAPIV3.SchemaObject = {
        type: 'string',
        minLength: 1,
        maxLength: 100,
      };

      const anotherValidators = TypeMapper.extractValidators(anotherSchema);

      expect(anotherValidators).toEqual([
        { type: 'MIN_LENGTH', params: 1 },
        { type: 'MAX_LENGTH', params: 100 },
      ]);
    });

    it('should extract validators for numeric schema', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'integer',
        minimum: 1,
        maximum: 100,
      };

      const validators = TypeMapper.extractValidators(schema);

      expect(validators).toEqual([
        { type: 'MIN', params: 1 },
        { type: 'MAX', params: 100 },
      ]);
    });

    it('should extract IS_NOT_EMPTY validator', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'string',
        minLength: 1,
        nullable: false,
      };

      const validators = TypeMapper.extractValidators(schema);

      expect(validators).toEqual([{ type: 'MIN_LENGTH', params: 1 }, { type: 'IS_NOT_EMPTY' }]);
    });

    it('should extract IS_UUID validator', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'string',
        format: 'uuid',
      };

      const validators = TypeMapper.extractValidators(schema);

      expect(validators).toEqual([{ type: 'IS_UUID' }]);
    });

    it('should extract IS_DATE validator for date-time format', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'string',
        format: 'date-time',
      };

      const validators = TypeMapper.extractValidators(schema);

      expect(validators).toEqual([{ type: 'IS_DATE' }]);
    });

    it('should extract IS_URL validator for uri format', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'string',
        format: 'uri',
      };

      const validators = TypeMapper.extractValidators(schema);

      expect(validators).toEqual([{ type: 'IS_URL' }]);
    });

    it('should return empty array if no validators are present', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'string',
      };

      const validators = TypeMapper.extractValidators(schema);

      expect(validators).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty schema object (fallback to any)', () => {
      const schema: OpenAPIV3.SchemaObject = {};

      const iType = TypeMapper.map(schema, new Map());

      expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
    });

    it('should handle array schema without items property', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'array',
      } as any; // Bypass TypeScript check to test edge case

      const iType = TypeMapper.map(schema, new Map());

      expect(iType).toEqual({ rawType: 'any[]', isArray: true, isPrimitive: false });
    });

    it('should handle string enum with title (named enum reference)', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'string',
        enum: ['ACTIVE', 'INACTIVE'],
        title: 'UserStatus',
      };

      const iType = TypeMapper.map(schema, new Map());

      expect(iType).toEqual({ rawType: 'UserStatus', isArray: false, isPrimitive: false });
    });

    it('should handle schema with unsupported type (fallback to any)', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'null' as any,
      };

      const iType = TypeMapper.map(schema, new Map());

      expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
    });

    it('should fallback to any for empty schema', () => {
      const schema: OpenAPIV3.SchemaObject = {};

      const iType = TypeMapper.map(schema, new Map());

      expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
    });

    it('should handle array without items property', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'array',
      } as any;

      const iType = TypeMapper.map(schema, new Map());

      expect(iType).toEqual({ rawType: 'any[]', isArray: true, isPrimitive: false });
    });

    it('should handle string enum with title (named enum)', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'string',
        enum: ['RED', 'GREEN', 'BLUE'],
        title: 'ColorEnum',
      };

      const iType = TypeMapper.map(schema, new Map());

      expect(iType).toEqual({ rawType: 'ColorEnum', isArray: false, isPrimitive: false });
    });

    it('should handle unsupported primitive type', () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: 'unknown' as any,
      };

      const iType = TypeMapper.map(schema, new Map());

      expect(iType).toEqual({ rawType: 'any', isArray: false, isPrimitive: true });
    });
  });
});
