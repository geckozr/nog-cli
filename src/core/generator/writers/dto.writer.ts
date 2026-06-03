import ts from 'typescript';

import { Logger } from '../../../utils/logger';
import { toKebabCase } from '../../../utils/naming';
import { IrModel, IrProperty, IrType, IrValidator, VALIDATOR_DECORATOR_MAP } from '../../ir';
import { TypeHelper } from '../helpers/type.helper';
import { AstPrinter, IAstPrintedFile } from './core/ast-printer';
import { CommentModifier } from './core/comment-modifier';
import { DeclarationBuilder } from './core/declaration-builder';
import { DecoratorBuilder } from './core/decorator-builder';
import { ExpressionBuilder } from './core/expression-builder';
import { HeaderGenerator } from './core/header-generator';
import { ImportBuilder } from './core/import-builder';
import { PropertyBuilder } from './core/property-builder';
import { PrimitiveTypeName, TypeBuilder, isPrimitiveTypeName } from './core/type-builder';

export class DtoWriter {
  constructor(
    private readonly printer: AstPrinter,
    private readonly headerGenerator: HeaderGenerator,
    private readonly importBuilder: ImportBuilder,
    private readonly typeBuilder: TypeBuilder,
    private readonly declarationBuilder: DeclarationBuilder,
    private readonly decoratorBuilder: DecoratorBuilder,
    private readonly propertyBuilder: PropertyBuilder,
    private readonly commentModifier: CommentModifier,
    private readonly expressionBuilder: ExpressionBuilder,
  ) {}

  /**
   * Generates the complete TypeScript code for a DTO class.
   *
   * @param model The Intermediate Representation of the DTO.
   * @param cliVersion The current version of the CLI.
   * @param specVersion The OpenAPI specification version.
   * @returns The generated TypeScript source code.
   */
  public async write(
    model: IrModel,
    allModels: IrModel[],
    inheritedProperties: Set<string>,
    cliVersion: string,
    specTitle: string,
    specVersion: string,
  ): Promise<IAstPrintedFile> {
    const classValidatorImports = new Set<string>();
    const classTransformerImports = new Set<string>();
    const customTypeImports = new Set<string>();
    const modelRegistry = new Map(allModels.map((m) => [m.name, m]));

    let mainNode: ts.ClassDeclaration | ts.EnumDeclaration;

    if (this.isPureOneOfModel(model)) {
      return this.buildTypeAlias(model, cliVersion, specTitle, specVersion);
    }

    if (model.isEnum) {
      mainNode = this.buildEnumNode(model);
    } else {
      mainNode = this.buildClassNode(
        model,
        inheritedProperties,
        customTypeImports,
        classValidatorImports,
        classTransformerImports,
      );
    }

    mainNode = this.commentModifier.addJSDoc(mainNode, model.description);

    const importNodes: ts.ImportDeclaration[] = [];

    if (classValidatorImports.size > 0) {
      importNodes.push(
        this.importBuilder.createNamedImport('class-validator', Array.from(classValidatorImports)),
      );
    }

    if (classTransformerImports.size > 0) {
      importNodes.push(
        this.importBuilder.createNamedImport(
          'class-transformer',
          Array.from(classTransformerImports),
        ),
      );
    }

    // TODO: This logic is duplicated in the service writer. Refactor to a shared utility that both writers can use to determine necessary imports based on used types.
    if (customTypeImports.size > 0) {
      const sortedCustomImports = Array.from(customTypeImports).sort();

      for (const customType of sortedCustomImports) {
        if (customType !== model.name) {
          const referencedModel = modelRegistry.get(customType);
          if (!referencedModel) continue;

          const importPath = this.formatDtoImportPath(referencedModel);
          importNodes.push(this.importBuilder.createNamedImport(importPath, [customType]));
        }
      }
    }

    const emptyLineNode = ts.factory.createIdentifier('\n');
    const fileNodes = [...importNodes, emptyLineNode, mainNode];
    const nodesWithHeader = this.headerGenerator.addHeader(
      fileNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    const fileExtension = model.isEnum ? 'enum.ts' : 'dto.ts';
    return this.printer.print(nodesWithHeader, `${model.fileName}.${fileExtension}`);
  }

  private isPureOneOfModel(model: IrModel): boolean {
    return (
      model.discriminator !== undefined &&
      model.subTypes !== undefined &&
      model.subTypes.length > 0 &&
      model.properties.length === 0 &&
      !model.extends
    );
  }

  private sanitizeEnumMemberName(value: string): string {
    return value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Builds an Enum declaration AST node.
   */
  private buildEnumNode(model: IrModel): ts.EnumDeclaration {
    const enumMembers = (model.enumValues || []).map((val) =>
      ts.factory.createEnumMember(
        ts.factory.createIdentifier(this.sanitizeEnumMemberName(val)),
        ts.factory.createStringLiteral(val),
      ),
    );

    return ts.factory.createEnumDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createIdentifier(model.name),
      enumMembers,
    );
  }

  /**
   * Builds a Class declaration AST node, including heritage clauses (extends).
   */
  private buildClassNode(
    model: IrModel,
    inheritedProperties: Set<string>,
    customTypeImports: Set<string>,
    classValidatorImports: Set<string>,
    classTransformerImports: Set<string>,
  ): ts.ClassDeclaration {
    const astProperties = model.properties.map((prop) => {
      const typeNode = this.mapIrType(prop.type, customTypeImports);
      const structuralDecorators = this.buildStructuralDecorators(
        prop,
        classValidatorImports,
        classTransformerImports,
      );
      const validatorDecorators = this.mapValidators(prop.validators, classValidatorImports);

      // `@IsOptional` is emitted before the structural decorators so it appears
      // first in the generated output (class-validator reads it as a guard).
      let isOptionalDecorator: ts.Decorator[] = [];
      if (prop.isOptional) {
        isOptionalDecorator = [this.decoratorBuilder.create('IsOptional')];
        classValidatorImports.add('IsOptional');
      }

      const decorators = [...isOptionalDecorator, ...structuralDecorators, ...validatorDecorators];

      if (prop.discriminator) {
        decorators.push(this.buildTypeDiscriminatorDecorator(prop, customTypeImports));
        classTransformerImports.add('Type');
      }

      return this.propertyBuilder.create(prop.name, typeNode, {
        isOptional: prop.isOptional,
        isReadonly: prop.isReadonly,
        isRedeclared: inheritedProperties.has(prop.name),
        description: prop.description,
        decorators: decorators,
      });
    });

    let heritageClauses: ts.HeritageClause[] | undefined = undefined;
    if (model.extends) {
      heritageClauses = [
        ts.factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
          ts.factory.createExpressionWithTypeArguments(
            ts.factory.createIdentifier(model.extends),
            undefined,
          ),
        ]),
      ];
      customTypeImports.add(model.extends);
    }

    return ts.factory.createClassDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createIdentifier(model.name),
      undefined,
      heritageClauses,
      astProperties,
    );
  }

  private buildStructuralDecorators(
    prop: IrProperty,
    classValidatorImports: Set<string>,
    classTransformerImports: Set<string>,
  ): ts.Decorator[] {
    const decorators: ts.Decorator[] = [];
    const rawType = Array.isArray(prop.type.rawType) ? prop.type.rawType[0] : prop.type.rawType;
    const hasDateValidator = prop.validators.some((v) => v.type === 'IS_DATE');

    // 1. Required vs Optional
    if (!prop.isOptional) {
      decorators.push(this.decoratorBuilder.create('IsNotEmpty'));
      classValidatorImports.add('IsNotEmpty');
    }

    // 2. Array
    if (prop.type.isArray) {
      decorators.push(this.decoratorBuilder.create('IsArray'));
      classValidatorImports.add('IsArray');
      return decorators; // `@IsArray` + the required/optional guard above is enough for arrays.
    }

    // 3. Date transformation (class-transformer, non class-validator)
    if (hasDateValidator || rawType === 'Date') {
      decorators.push(
        this.decoratorBuilder.create('Type', [
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            [],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createIdentifier('Date'),
          ),
        ]),
      );
      classTransformerImports.add('Type');
      return decorators; // @Type gestisce la trasformazione, niente IsString/IsNumber
    }

    if (prop.discriminator) {
      decorators.push(this.decoratorBuilder.create('ValidateNested'));
      classValidatorImports.add('ValidateNested');
    }

    const hasUrlValidator = prop.validators.some((v) => v.type === 'IS_URL');

    // 4. Primitive type-based decorators
    if (!prop.discriminator) {
      if (rawType === 'string' && !hasUrlValidator) {
        decorators.push(this.decoratorBuilder.create('IsString'));
        classValidatorImports.add('IsString');
      } else if (rawType === 'number') {
        decorators.push(this.decoratorBuilder.create('IsNumber'));
        classValidatorImports.add('IsNumber');
      } else if (rawType === 'boolean') {
        decorators.push(this.decoratorBuilder.create('IsBoolean'));
        classValidatorImports.add('IsBoolean');
      }
    }

    // 5. Inline enum union → @IsIn(['val1', 'val2'])
    if (
      Array.isArray(prop.type.rawType) &&
      prop.type.composition === 'union' &&
      prop.type.isPrimitive
    ) {
      const elements = prop.type.rawType.map((v) => ts.factory.createStringLiteral(v));
      decorators.push(
        this.decoratorBuilder.create('IsIn', [ts.factory.createArrayLiteralExpression(elements)]),
      );
      classValidatorImports.add('IsIn');
    }

    return decorators;
  }

  private buildTypeDiscriminatorDecorator(
    prop: IrProperty,
    customImports: Set<string>,
  ): ts.Decorator {
    const disc = prop.discriminator!;

    // 1. Arrow Function: () => BaseClass
    const baseTypeName = Array.isArray(prop.type.rawType)
      ? prop.type.rawType[0]
      : prop.type.rawType;
    const arrowFunc = this.expressionBuilder.createArrowFunctionReturningIdentifier(baseTypeName);

    // 2. Map each discriminator subtype to an object literal.
    const subTypesElements = Object.entries(disc.mapping).map(([value, className]) => {
      customImports.add(className);

      return this.expressionBuilder.createObjectLiteral({
        value: this.expressionBuilder.createIdentifier(className),
        name: this.expressionBuilder.createStringLiteral(value),
      });
    });

    // 3. Nested configuration object passed to `@Type(...)`.
    const configObj = this.expressionBuilder.createObjectLiteral({
      keepDiscriminatorProperty: this.expressionBuilder.createBooleanLiteral(true),
      discriminator: this.expressionBuilder.createObjectLiteral({
        property: this.expressionBuilder.createStringLiteral(disc.propertyName),
        subTypes: this.expressionBuilder.createArrayLiteral(subTypesElements),
      }),
    });

    return this.decoratorBuilder.create('Type', [arrowFunc, configObj]);
  }

  private async buildTypeAlias(
    model: IrModel,
    cliVersion: string,
    specTitle: string,
    specVersion: string,
  ): Promise<IAstPrintedFile> {
    const subTypes = model.subTypes!;

    // One import per subtype
    const importNodes: ts.ImportDeclaration[] = subTypes.map((st) =>
      this.importBuilder.createNamedImport(`./${toKebabCase(st.name)}.dto`, [st.name]),
    );

    // Union type node: Cat | Dog | Bird
    const unionNode = this.typeBuilder.createUnion(
      subTypes.map((st) => this.typeBuilder.createReference(st.name)),
    );

    let aliasNode = this.declarationBuilder.createTypeAlias(model.name, unionNode);
    aliasNode = this.commentModifier.addJSDoc(aliasNode, model.description);

    const emptyLineNode = ts.factory.createIdentifier('\n');
    const fileNodes = [...importNodes, emptyLineNode, aliasNode];
    const nodesWithHeader = this.headerGenerator.addHeader(
      fileNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    return this.printer.print(nodesWithHeader, `${model.fileName}.dto.ts`);
  }

  /**
   * Converts a PascalCase class name to a kebab-case import path.
   * @example 'AccountBalanceLimitsData' -> './account-balance-limits-data.dto'
   */
  private formatDtoImportPath(referencedModel: IrModel): string {
    const suffix = referencedModel.isEnum ? '.enum' : '.dto';
    return `./${referencedModel.fileName}${suffix}`;
  }

  /**
   * Maps an IrType to the equivalent AST nodes.
   */
  private mapIrType(irType: IrType, customImports: Set<string>): ts.TypeNode {
    if (Array.isArray(irType.rawType)) {
      const memberNodes = irType.rawType.map((t) => {
        if (irType.isPrimitive) {
          return ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(t));
        } else {
          customImports.add(t);
          return this.typeBuilder.createReference(t);
        }
      });

      const composedNode =
        irType.composition === 'intersection'
          ? ts.factory.createIntersectionTypeNode(memberNodes)
          : this.typeBuilder.createUnion(memberNodes);

      return irType.isArray ? this.typeBuilder.createArray(composedNode) : composedNode;
    }

    const typeName = irType.rawType;

    let baseTypeNode: ts.TypeNode;

    if (irType.isPrimitive) {
      baseTypeNode = this.typeBuilder.createPrimitive(
        isPrimitiveTypeName(typeName) ? typeName : 'any',
      );
    } else if (typeName.startsWith('Record<')) {
      baseTypeNode = this.buildRecordTypeNode(typeName, customImports);
    } else {
      baseTypeNode = this.typeBuilder.createReference(typeName);
      if (TypeHelper.needsImport(irType)) {
        customImports.add(typeName);
      }
    }

    if (irType.isArray) {
      return this.typeBuilder.createArray(baseTypeNode);
    }

    return baseTypeNode;
  }

  /**
   * Builds a Record<string, V> type node.
   * Only the value type V is registered as a custom import when it is not primitive.
   *
   * @param rawType The full Record type string, e.g. 'Record<string, UserRecords>'.
   * @param customImports The import registry to update with the value type, if needed.
   * @returns A TypeReferenceNode representing Record<string, V>.
   */
  private buildRecordTypeNode(rawType: string, customImports: Set<string>): ts.TypeReferenceNode {
    const valueTypeName = TypeHelper.extractRecordValueType(rawType);

    let valueNode: ts.TypeNode;
    if (valueTypeName && !isPrimitiveTypeName(valueTypeName)) {
      customImports.add(valueTypeName);
      valueNode = this.typeBuilder.createReference(valueTypeName);
    } else {
      const primitive = isPrimitiveTypeName(valueTypeName ?? 'any')
        ? (valueTypeName as PrimitiveTypeName)
        : 'any';
      valueNode = this.typeBuilder.createPrimitive(primitive);
    }

    return this.typeBuilder.createReference('Record', [
      this.typeBuilder.createPrimitive('string'),
      valueNode,
    ]);
  }

  /**
   * Convert the IrValidators into ts.Decorator. Updates the importsSet with any class-validator decorators used.
   *
   * @param validators The array of IrValidators to convert.
   * @param importsSet A Set to track which class-validator decorators need to be imported.
   * @returns An array of ts.Decorator nodes corresponding to the provided validators.
   */
  private mapValidators(validators: IrValidator[], importsSet: Set<string>): ts.Decorator[] {
    return validators.flatMap((val) => {
      const decoratorName = VALIDATOR_DECORATOR_MAP[val.type];
      if (!decoratorName) {
        Logger.warn(`Unsupported validator type: ${val.type}`);
        return [];
      }

      importsSet.add(decoratorName);

      const args: ts.Expression[] = [];
      if (val.params !== undefined) {
        if (typeof val.params === 'number') {
          args.push(ts.factory.createNumericLiteral(val.params));
        } else if (val.type === 'MATCHES') {
          args.push(ts.factory.createRegularExpressionLiteral(`/${val.params}/`));
        } else if (typeof val.params === 'string') {
          args.push(ts.factory.createStringLiteral(val.params));
        }
      }

      return [this.decoratorBuilder.create(decoratorName, args)];
    });
  }
}
