import { SourceFile } from 'ts-morph';

import { IrModel, IrProperty, IrService, IrValidator } from '../../ir/interfaces';
import { DecoratorHelper } from './decorator.helper';
import { TypeHelper } from './type.helper';

/**
 * Helper class to manage automatic imports in generated files.
 * It resolves dependencies between DTOs, Enums, and Services.
 */
export class ImportHelper {
  /**
   * Adds all necessary imports for a DTO class.
   * Includes class-validator decorators, class-transformer types, and other referenced DTOs.
   */
  static addDtoImports(sourceFile: SourceFile, model: IrModel, allModels: IrModel[] = []): void {
    // 1. Import class-validator decorators
    this.addValidatorImports(sourceFile, model);

    // 1.1 Import class-transformer Type for date-time properties or discriminator
    // We need @Type(() => Date) for dates or @Type(() => Base) for polymorphism
    const needsTypeDecorator = model.properties.some(
      (prop) =>
        !prop.type.isArray &&
        (prop.validators?.some((validator) => validator.type === 'IS_DATE') === true ||
          prop.discriminator !== undefined),
    );

    if (needsTypeDecorator) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: 'class-transformer',
        namedImports: ['Type'],
      });
    }

    // 2. Collect all referenced types (from properties and parent class)
    // Map key is the type name to avoid duplicates
    const imports = new Map<string, { typeName: string; fileName: string; extension: string }>();

    // Process Property Imports
    for (const prop of model.properties) {
      if (TypeHelper.needsImport(prop.type)) {
        this.collectImportsForType(prop.type.rawType, model.name, allModels, imports);
      }

      // Handle specific Record<string, ValueType> case
      if (typeof prop.type.rawType === 'string' && prop.type.rawType.startsWith('Record<')) {
        const valueType = TypeHelper.extractRecordValueType(prop.type.rawType);
        if (valueType && !this.isBuiltInType(valueType)) {
          this.collectImportsForType(valueType, model.name, allModels, imports);
        }
      }
    }

    // Process Parent Class Import (extends)
    if (model.extends) {
      this.collectImportsForType(model.extends, model.name, allModels, imports);
    }

    // 3. Add generated import declarations to source file
    for (const [, { typeName, fileName, extension }] of imports) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: `./${fileName}.${extension}`,
        namedImports: [typeName],
      });
    }
  }

  /**
   * Adds imports for class-validator decorators based on property rules.
   */
  private static addValidatorImports(sourceFile: SourceFile, model: IrModel): void {
    const decorators = new Set<string>();

    for (const prop of model.properties) {
      // Standard structural decorators
      if (prop.isOptional) {
        decorators.add('IsOptional');
      } else {
        decorators.add('IsNotEmpty');
      }

      if (prop.discriminator) {
        decorators.add('ValidateNested');
      }

      // Type-based decorators (e.g., IsString, IsNumber)
      this.addTypeDecorators(decorators, prop);

      // Explicit validators from IR
      for (const validator of prop.validators) {
        const names = DecoratorHelper.collectDecoratorNames([validator]);
        names.forEach((name) => decorators.add(name));
      }
    }

    if (decorators.size > 0) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: 'class-validator',
        namedImports: Array.from(decorators).sort(),
      });
    }
  }

  /**
   * Infers and adds decorators based on the property type.
   */
  private static addTypeDecorators(decorators: Set<string>, prop: IrProperty): void {
    const typeString = TypeHelper.irTypeToString(prop.type);
    const hasUrlValidator = Array.isArray(prop.validators)
      ? prop.validators.some((v: IrValidator) => v.type === 'IS_URL')
      : false;

    if (prop.type.isArray) {
      decorators.add('IsArray');
      return;
    }

    if (typeString === 'string') {
      if (!hasUrlValidator) {
        decorators.add('IsString');
      }
      return;
    }

    if (typeString === 'number') {
      decorators.add('IsNumber');
      return;
    }

    if (typeString === 'boolean') {
      decorators.add('IsBoolean');
      return;
    }

    // If it's a union of primitives (enum-like), add IsIn
    if (
      Array.isArray(prop.type.rawType) &&
      prop.type.composition === 'union' &&
      prop.type.isPrimitive
    ) {
      decorators.add('IsIn');
      return;
    }
  }

  /**
   * Adds imports required by a Service class (NestJS common, Axios, RxJS, DTOs).
   */
  static addServiceImports(sourceFile: SourceFile, service: IrService, allModels: IrModel[]): void {
    // NestJS & Utilities Dependencies
    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/common',
      namedImports: ['Injectable'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/axios',
      namedImports: ['HttpService'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: 'rxjs',
      namedImports: ['Observable', 'firstValueFrom'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: 'rxjs/operators',
      namedImports: ['map'],
    });

    const modelsMap = new Map<string, IrModel>();
    for (const model of allModels) {
      modelsMap.set(model.name, model);
    }

    this.addOperationDtoImports(sourceFile, service, modelsMap);
  }

  private static addOperationDtoImports(
    sourceFile: SourceFile,
    service: IrService,
    allModels: Map<string, IrModel>,
  ): void {
    const dtoImports = new Map<string, { typeName: string; fileName: string; isEnum: boolean }>();

    for (const [, operation] of service.operations) {
      // Imports from Parameters
      for (const param of operation.parameters) {
        if (TypeHelper.needsImport(param.type)) {
          this.collectOperationImports(param.type.rawType, allModels, dtoImports);
        }
      }

      // Imports from Return Type
      if (TypeHelper.needsImport(operation.returnType)) {
        this.collectOperationImports(operation.returnType.rawType, allModels, dtoImports);
      }
    }

    // Aggiungi gli import con l'estensione corretta
    for (const [, { typeName, fileName, isEnum }] of dtoImports) {
      const extension = isEnum ? 'enum' : 'dto';
      sourceFile.addImportDeclaration({
        moduleSpecifier: `../dto/${fileName}.${extension}`,
        namedImports: [typeName],
      });
    }
  }

  // --- Helpers for DTO Imports ---

  private static collectImportsForType(
    rawType: string | string[],
    currentModelName: string,
    allModels: IrModel[],
    imports: Map<string, { typeName: string; fileName: string; extension: string }>,
  ): void {
    const typesToProcess = Array.isArray(rawType) ? rawType : [rawType];

    for (const typeName of typesToProcess) {
      if (typeName === currentModelName) continue; // Skip self-reference

      const refModel = allModels.find((m) => m.name === typeName);
      // If model not found, try generic calculation (or skip if primitive)
      const fileName = refModel ? refModel.fileName : TypeHelper.getFileName(typeName);
      const extension = this.getExtensionForType(typeName, allModels);

      imports.set(typeName, { typeName, fileName, extension });
    }
  }

  private static getExtensionForType(typeName: string, allModels: IrModel[]): string {
    const model = allModels.find((m) => m.name === typeName);
    return model?.isEnum ? 'enum' : 'dto';
  }

  // --- Helpers for Service Imports ---

  private static collectOperationImports(
    rawType: string | string[],
    allModels: Map<string, IrModel>,
    dtoImports: Map<string, { typeName: string; fileName: string; isEnum: boolean }>,
  ): void {
    const typesToProcess = Array.isArray(rawType) ? rawType : [rawType];

    for (const tn of typesToProcess) {
      const model = allModels.get(tn);
      const fileName = model ? model.fileName : TypeHelper.getFileName(tn);
      const isEnum = model ? model.isEnum : false;
      dtoImports.set(tn, { typeName: tn, fileName, isEnum });
    }
  }

  private static isBuiltInType(type: string): boolean {
    return ['string', 'number', 'boolean', 'any', 'void', 'Date'].includes(type);
  }
}
