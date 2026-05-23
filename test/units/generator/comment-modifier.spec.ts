import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { CommentModifier } from '../../../src/core/generator/writers/core/comment-modifier';

describe('CommentModifier', () => {
  let commentModifier: CommentModifier;
  let printer: AstPrinter;
  let mockNode: ts.Identifier;

  beforeEach(() => {
    commentModifier = new CommentModifier();
    printer = new AstPrinter();
    mockNode = ts.factory.createIdentifier('testProperty');
  });

  describe('addMultiLineComment', () => {
    it('should attach a correctly formatted single-line JSDoc comment', async () => {
      const resultNode = commentModifier.addJSDoc(mockNode, 'This is a test property.');
      const output = await printer.print([resultNode]);

      expect(output.generatedCode).toContain('/**\n * This is a test property.\n */');
      expect(output.generatedCode).toContain('testProperty');
    });

    it('should format and attach a multi-line JSDoc comment', async () => {
      const multiLineText = 'First line.\nSecond line.';
      const resultNode = commentModifier.addJSDoc(mockNode, multiLineText);
      const output = await printer.print([resultNode]);

      expect(output.generatedCode).toContain('/**\n * First line.\n * Second line.\n */');
    });

    it('should return the original node unmodified if description is undefined', async () => {
      const resultNode = commentModifier.addJSDoc(mockNode, undefined);
      const output = await printer.print([resultNode]);

      expect(output.generatedCode).not.toContain('/**');
      expect(output.generatedCode).toBe('testProperty;\n');
    });

    it('should return the original node unmodified if description is purely whitespace', async () => {
      const resultNode = commentModifier.addJSDoc(mockNode, '   \n  ');
      const output = await printer.print([resultNode]);

      expect(output.generatedCode).not.toContain('/**');
    });
  });

  describe('addSingleLineComment', () => {
    it('should attach a single line comment', async () => {
      const resultNode = commentModifier.addSingleLineComment(mockNode, 'Internal note');
      const output = await printer.print([resultNode]);

      expect(output.generatedCode).toContain('// Internal note\n');
      expect(output.generatedCode).toContain('testProperty');
    });

    it('should return the original node unmodified if text is undefined', async () => {
      const resultNode = commentModifier.addSingleLineComment(mockNode, undefined);
      const output = await printer.print([resultNode]);

      expect(output.generatedCode).not.toContain('//');
      expect(output.generatedCode).toBe('testProperty;\n');
    });

    it('should return the original node unmodified if text is purely whitespace', async () => {
      const resultNode = commentModifier.addSingleLineComment(mockNode, '   \n  ');
      const output = await printer.print([resultNode]);

      expect(output.generatedCode).not.toContain('//');
    });
  });
});
