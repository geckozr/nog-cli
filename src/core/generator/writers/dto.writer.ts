import { ClassDeclaration, Project, PropertyDeclaration, Scope, SourceFile } from 'ts-morph';

import { toKebabCase } from '../../../utils';
import { IrModel, IrProperty } from '../../ir/interfaces';
import { DecoratorHelper } from '../helpers/decorator.helper';
import { FileHeaderHelper } from '../helpers/file-header.helper';
import { ImportHelper } from '../helpers/import.helper';
import { TypeHelper } from '../helpers/type.helper';

/**
 * Generates Data Transfer Object (DTO) and Enum files from the Internal Representation.
 *
 * Emission Strategy:
 * - **Pure OneOf Models**: Union types with discriminator but no properties → rendered as type aliases.
 * - **Hybrid Models**: Classes with properties, inheritance, or mixed composition → rendered as classes with validation decorators.
 * - **Enums**: Simple value enumerations → rendered as TypeScript enums with sanitized member names.
 *
 * Each model is emitted with:
 * - Class-validator decorators for runtime validation.
 * - Class-transformer type hints for deserialization.
 * - JSDoc documentation from OpenAPI schema descriptions.
 * - Standard file header with generation metadata.
 */
export class DtoWriter {
  /**
   * Instantiates the DTO writer.
   *
   * @param project - The ts-morph Project instance for AST manipulation.
   * @param outputDir - The target directory where DTO files will be written.
   * @param allModels - The complete list of IR models (used for resolving cross-references and parent types).
   * @param specTitle - The OpenAPI specification title for file header metadata.
   * @param specVersion - The OpenAPI specification version for file header metadata.
   */
  constructor(
    private readonly project: Project,
    private readonly outputDir: string,
    private allModels: IrModel[] = [],
    private readonly specTitle: string = 'Unknown Spec',
    private readonly specVersion: string = 'Unknown Version',
  ) {}

  /**
   * Writes all provided models as DTO classes or Enums.
   *
   * @param models - The list of models to generate.
   */
  async writeAll(models: IrModel[]): Promise<void> {
    // Keep a reference for downstream imports (union/intersection, parent types, enums)
    this.allModels = models;

    for (const model of models) {
      if (model.isEnum) {
        this.writeEnum(model);
      } else {
        this.writeDto(model);
      }
    }
  }

  /**
   * Writes a single DTO class or OneOf type alias based on the model shape.
   * Pure OneOf models (discriminator + subTypes, no own properties or base type) are rendered as union type aliases.
   * Hybrid models emit classes with properties, inheritance, and validation decorators.
   *
   * @param model The IR model to emit.
   * @returns void
   */
  private writeDto(model: IrModel): void {
    const fileName = `${model.fileName}.dto.ts`;
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/dto/${fileName}`, '', {
      overwrite: true,
    });

    // Handle "pure" OneOf models (e.g. types that are just a union of other types with a discriminator)
    // In this case, we generate a Type Alias instead of a Class.
    if (this.isPureOneOfModel(model)) {
      this.writeTypeAlias(sourceFile, model);
      return;
    }

    // Add necessary imports
    ImportHelper.addDtoImports(sourceFile, model, this.allModels);

    // Create the Class
    const classDecl = sourceFile.addClass({
      name: model.name,
      isExported: true,
      docs: model.description ? [{ description: model.description }] : undefined,
    });

    // Handle Inheritance
    if (model.extends) {
      classDecl.setExtends(model.extends);
    }

    // Add Properties
    for (const prop of model.properties) {
      this.addProperty(classDecl, prop, sourceFile);
    }

    // Add header and format the file
    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  /**
   * Determines whether the model qualifies as a pure OneOf union.
   * A model qualifies when it defines a discriminator and subTypes but has no own properties and no base class.
   *
   * @param model The IR model under evaluation.
   * @returns True when the generator should emit a union type alias instead of a class.
   */
  private isPureOneOfModel(model: IrModel): boolean {
    return (
      model.discriminator !== undefined &&
      model.subTypes !== undefined &&
      model.subTypes.length > 0 &&
      model.properties.length === 0 &&
      !model.extends
    );
  }

  /**
   * Writes a type alias for a pure OneOf model (union of subTypes).
   *
   * @param sourceFile The target source file where the alias is emitted.
   * @param model The IR model describing the union members.
   * @returns void
   */
  private writeTypeAlias(sourceFile: SourceFile, model: IrModel): void {
    if (!model.subTypes || model.subTypes.length === 0) return;

    // Add imports for union types
    const typeNames = model.subTypes.map((st) => st.name);
    for (const typeName of typeNames) {
      const refModel = this.allModels.find((m) => m.name === typeName);
      // Fallback to kebab-case conversion if model not found in registry
      const refFileName = refModel ? refModel.fileName : toKebabCase(typeName);

      sourceFile.addImportDeclaration({
        moduleSpecifier: `./${refFileName}.dto`,
        namedImports: [typeName],
      });
    }

    // Create Type Alias
    const unionType = typeNames.join(' | ');
    sourceFile.addTypeAlias({
      name: model.name,
      type: unionType,
      isExported: true,
      docs: model.description ? [{ description: model.description }] : undefined,
    });

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  /**
   * Adds a property to the DTO class with correct type and decorators.
   */
  private addProperty(
    classDecl: ClassDeclaration,
    prop: IrProperty,
    _sourceFile: SourceFile,
  ): void {
    const propertyDecl = classDecl.addProperty({
      name: prop.name,
      type: TypeHelper.irTypeToString(prop.type),
      hasQuestionToken: prop.isOptional,
      isReadonly: prop.isReadonly,
      scope: Scope.Public,
      docs: prop.description ? [{ description: prop.description }] : undefined,
      hasExclamationToken: !prop.isOptional, // Strict Property Initialization
    });

    // Add structural decorators
    if (prop.isOptional) {
      propertyDecl.addDecorator({
        name: 'IsOptional',
        arguments: [],
      });
    } else {
      propertyDecl.addDecorator({
        name: 'IsNotEmpty',
        arguments: [],
      });
    }

    if (prop.discriminator) {
      // NOTE: Consider adding { each: true } if it's an array for stricter validation
      propertyDecl.addDecorator({
        name: 'ValidateNested',
        arguments: prop.type.isArray ? ['{ each: true }'] : [],
      });
    }

    // Add automatic type-based decorators (e.g. IsString, IsInt, Type)
    this.addTypeBasedDecorators(propertyDecl, prop);

    // Add validation decorators defined in schema (e.g. Min, Max, Regex)
    DecoratorHelper.addValidators(propertyDecl, prop.validators);
  }

  /**
   * Infers and adds validation decorators based on the property type.
   */
  private addTypeBasedDecorators(prop: PropertyDeclaration, irProp: IrProperty): void {
    const typeString = TypeHelper.irTypeToString(irProp.type);
    const hasUrlValidator = irProp.validators.some((v) => v.type === 'IS_URL');
    const hasDateValidator = irProp.validators.some((v) => v.type === 'IS_DATE');

    // Array Handling
    if (irProp.type.isArray) {
      prop.addDecorator({
        name: 'IsArray',
        arguments: [],
      });
    }

    // Date Handling (Transformation)
    if (hasDateValidator) {
      prop.addDecorator({
        name: 'Type',
        arguments: ['() => Date'],
      });
      return;
    }

    // Discriminator Handling (Polymorphism)
    if (irProp.discriminator) {
      this.addDiscriminatorDecorator(prop, irProp);
      return;
    }

    // String Handling
    if (typeString === 'string') {
      // Skip if it was an array (already handled by IsArray) to avoid IsString on string[]
      if (irProp.type.isArray) return;

      if (!hasUrlValidator) {
        prop.addDecorator({
          name: 'IsString',
          arguments: [],
        });
      }
      return;
    }

    // Number Handling
    if (typeString === 'number') {
      if (irProp.type.isArray) return; // Skip IsNumber for number[]

      prop.addDecorator({
        name: 'IsNumber',
        arguments: [],
      });
      return;
    }

    // Boolean Handling
    if (typeString === 'boolean') {
      if (irProp.type.isArray) return; // Skip IsBoolean for boolean[]

      prop.addDecorator({
        name: 'IsBoolean',
        arguments: [],
      });
      return;
    }

    // Enum-like Union Handling (e.g., 'active' | 'inactive')
    if (
      Array.isArray(irProp.type.rawType) &&
      irProp.type.composition === 'union' &&
      irProp.type.isPrimitive
    ) {
      // rawType is like ["available", "pending", "sold"]
      // Wrap values in single quotes for the @IsIn array
      const values = irProp.type.rawType.map((v) => `'${v}'`).join(', ');
      prop.addDecorator({
        name: 'IsIn',
        arguments: [`[${values}]`],
      });
      return;
    }
  }

  /**
   * Adds `@Type` decorator with discriminator configuration for polymorphic types.
   */
  private addDiscriminatorDecorator(prop: PropertyDeclaration, irProp: IrProperty): void {
    const discriminator = irProp.discriminator;
    if (!discriminator) return;

    // Determine base class (usually the first one in the union)
    const baseTypeName = Array.isArray(irProp.type.rawType)
      ? irProp.type.rawType[0]
      : irProp.type.rawType;

    // Build subTypes array for class-transformer
    const subTypes = Object.entries(discriminator.mapping).map(([value, className]) => {
      return `{ value: ${className}, name: '${value}' }`;
    });

    const discriminatorConfig = `{
      keepDiscriminatorProperty: true,
      discriminator: {
        property: '${discriminator.propertyName}',
        subTypes: [${subTypes.join(', ')}]
      }
    }`;

    prop.addDecorator({
      name: 'Type',
      arguments: [`() => ${baseTypeName}`, discriminatorConfig],
    });
  }

  /**
   * Writes an Enum file.
   */
  private writeEnum(model: IrModel): void {
    const fileName = `${model.fileName}.enum.ts`;
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/dto/${fileName}`, '', {
      overwrite: true,
    });

    sourceFile.addEnum({
      name: model.name,
      isExported: true,
      docs: model.description ? [{ description: model.description }] : undefined,
      members:
        model.enumValues?.map((val) => ({
          name: this.sanitizeEnumMemberName(val),
          value: val,
        })) || [],
    });

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  /**
   * Sanitizes an enum member name to be uppercase and underscored.
   * Example: "active-user" -> "ACTIVE_USER"
   */
  private sanitizeEnumMemberName(value: string): string {
    return value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
