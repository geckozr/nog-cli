import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { CommentModifier } from '../../../src/core/generator/writers/core/comment-modifier';
import { ParameterBuilder } from '../../../src/core/generator/writers/core/parameter-builder';
import { ServiceMethodBuilder } from '../../../src/core/generator/writers/core/service-method-builder';
import { TypeBuilder } from '../../../src/core/generator/writers/core/type-builder';

describe('ServiceMethodBuilder', () => {
  let methodBuilder: ServiceMethodBuilder;
  let paramBuilder: ParameterBuilder;
  let typeBuilder: TypeBuilder;
  let printer: AstPrinter;

  beforeEach(() => {
    const commentModifier = new CommentModifier();
    paramBuilder = new ParameterBuilder(commentModifier);
    typeBuilder = new TypeBuilder();
    methodBuilder = new ServiceMethodBuilder(commentModifier);
    printer = new AstPrinter();
  });

  it('should build a complete method signature with JSDoc', async () => {
    const idParam = paramBuilder.buildRegular('id', typeBuilder.createPrimitive('string'));

    const userDtoType = typeBuilder.createReference('UserDto');
    const observableReturnType = typeBuilder.createReference('Observable', [userDtoType]);

    const emptyBody = ts.factory.createBlock([], true);

    const methodNode = methodBuilder.build(
      'getUserById$',
      [idParam],
      observableReturnType,
      emptyBody,
      'Fetches a user by their unique identifier.',
    );

    const classNode = ts.factory.createClassDeclaration(
      undefined,
      ts.factory.createIdentifier('DummyClass'),
      undefined,
      undefined,
      [methodNode],
    );

    const output = await printer.print([classNode]);

    expect(output.generatedCode).toContain('/**');
    expect(output.generatedCode).toContain('* Fetches a user by their unique identifier.');
    expect(output.generatedCode).toContain('*/');
    expect(output.generatedCode).toContain(
      'public getUserById$(id: string): Observable<UserDto> {',
    );
  });
});
