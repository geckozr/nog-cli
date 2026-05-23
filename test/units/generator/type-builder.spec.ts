import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';

describe('TypeBuilder', () => {
  let typeBuilder: TypeBuilder;
  let printer: AstPrinter;

  beforeEach(() => {
    typeBuilder = new TypeBuilder();
    printer = new AstPrinter();
  });

  // Wraps the candidate `TypeNode` in `type TestAlias = <typeNode>;`, prints it
  // through the AstPrinter, and returns just the right-hand side for assertions.
  const printType = async (typeNode: ts.TypeNode): Promise<string> => {
    const aliasNode = ts.factory.createTypeAliasDeclaration(
      undefined,
      ts.factory.createIdentifier('TestAlias'),
      undefined,
      typeNode,
    );
    const output = await printer.print([aliasNode]);
    return output.generatedCode.replace('type TestAlias = ', '').replace(';\n', '');
  };

  describe('createPrimitive', () => {
    it('should create a string type', async () => {
      const node = typeBuilder.createPrimitive('string');
      expect(await printType(node)).toBe('string');
    });

    it('should create a number type', async () => {
      const node = typeBuilder.createPrimitive('number');
      expect(await printType(node)).toBe('number');
    });

    it('should create a boolean type', async () => {
      const node = typeBuilder.createPrimitive('boolean');
      expect(await printType(node)).toBe('boolean');
    });

    it('should create a void type', async () => {
      const node = typeBuilder.createPrimitive('void');
      expect(await printType(node)).toBe('void');
    });

    it('should fallback to any for unknown types', async () => {
      // @ts-expect-error Testing invalid input gracefully handled
      const node = typeBuilder.createPrimitive('unknownType');
      expect(await printType(node)).toBe('any');
    });
  });

  describe('createReference', () => {
    it('should create a type reference node', async () => {
      const node = typeBuilder.createReference('UserDto');
      expect(await printType(node)).toBe('UserDto');
    });
  });

  describe('createArray', () => {
    it('should create an array of primitives', async () => {
      const stringType = typeBuilder.createPrimitive('string');
      const node = typeBuilder.createArray(stringType);
      expect(await printType(node)).toBe('string[]');
    });

    it('should create an array of references', async () => {
      const refType = typeBuilder.createReference('AnimalDto');
      const node = typeBuilder.createArray(refType);
      expect(await printType(node)).toBe('AnimalDto[]');
    });
  });

  describe('createUnion', () => {
    it('should create a union type', async () => {
      const catRef = typeBuilder.createReference('Cat');
      const dogRef = typeBuilder.createReference('Dog');
      const node = typeBuilder.createUnion([catRef, dogRef]);

      expect(await printType(node)).toBe('Cat | Dog');
    });

    it('should return single type for union with one element', async () => {
      const catRef = typeBuilder.createReference('Cat');
      const node = typeBuilder.createUnion([catRef]);

      expect(await printType(node)).toBe('Cat');
    });

    it('should throw an error if no types are provided', async () => {
      expect(() => typeBuilder.createUnion([])).toThrowError(
        'Cannot create a union type without type nodes.',
      );
    });
  });

  describe('createIntersection', () => {
    it('should create an intersection type', async () => {
      const baseRef = typeBuilder.createReference('BaseEntity');
      const timestampRef = typeBuilder.createReference('Timestamped');
      const node = typeBuilder.createIntersection([baseRef, timestampRef]);

      expect(await printType(node)).toBe('BaseEntity & Timestamped');
    });

    it('should return single type for intersection with one element', async () => {
      const baseRef = typeBuilder.createReference('BaseEntity');
      const node = typeBuilder.createIntersection([baseRef]);

      expect(await printType(node)).toBe('BaseEntity');
    });

    it('should throw an error if no types are provided', async () => {
      expect(() => typeBuilder.createIntersection([])).toThrowError(
        'Cannot create an intersection type without type nodes.',
      );
    });
  });
});
