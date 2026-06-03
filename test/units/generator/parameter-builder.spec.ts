import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { CommentModifier } from '../../../src/core/generator/writers/core/comment-modifier';
import {
  InlineParameterDef,
  ParameterBuilder,
} from '../../../src/core/generator/writers/core/parameter-builder';

describe('ParameterBuilder', () => {
  let builder: ParameterBuilder;
  let printer: AstPrinter;

  beforeEach(() => {
    const commentModifier = new CommentModifier();
    builder = new ParameterBuilder(commentModifier);
    printer = new AstPrinter();
  });

  const printParam = async (node: ts.ParameterDeclaration) => {
    const func = ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      'dummy',
      undefined,
      [node],
      undefined,
      ts.factory.createBlock([]),
    );
    const output = await printer.print([func]);
    const match = output.generatedCode.match(/function dummy\(([\s\S]*?)\) \{/);
    return match ? match[1].trim() : '';
  };

  it('should build a regular required parameter', async () => {
    const typeNode = ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    const node = builder.buildRegular('userId', typeNode);
    expect(await printParam(node)).toBe('userId: string');
  });

  it('should build a regular optional parameter', async () => {
    const typeNode = ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
    const node = builder.buildRegular('limit', typeNode, true);
    expect(await printParam(node)).toBe('limit?: number');
  });

  it('should build an inline object parameter with JSDoc and special characters', async () => {
    const stringType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    const numberType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);

    const properties: InlineParameterDef[] = [
      {
        name: 'apiKey',
        typeNode: stringType,
        isOptional: false,
        description: 'The authentication key',
      },
      {
        name: 'X-Custom-Header',
        typeNode: stringType,
        isOptional: true,
        description: 'A custom header',
      },
      {
        name: 'limit',
        typeNode: numberType,
        isOptional: true,
      },
    ];

    const node = builder.buildInlineObject('params', properties, true);
    const output = await printParam(node);

    expect(output).toContain('params?: {');
    expect(output).toMatch(/\/\*\*[\s\S]*?The authentication key[\s\S]*?\*\//);
    expect(output).toContain('apiKey: string;');
    expect(output).toMatch(/\/\*\*[\s\S]*?A custom header[\s\S]*?\*\//);
    expect(output).toContain("'X-Custom-Header'?: string;");
    expect(output).toContain('limit?: number;');
  });

  it('should build an inline not optional object parameter', async () => {
    const stringType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);

    const properties: InlineParameterDef[] = [
      {
        name: 'apiKey',
        typeNode: stringType,
        isOptional: false,
        description: 'The authentication key',
      },
    ];

    const node = builder.buildInlineObject('params', properties, false);
    const output = await printParam(node);

    expect(output).toContain('params: {');
    expect(output).toMatch(/\/\*\*[\s\S]*?The authentication key[\s\S]*?\*\//);
    expect(output).toContain('apiKey: string;');
  });
});
