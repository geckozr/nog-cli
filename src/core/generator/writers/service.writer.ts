import ts from 'typescript';

import { IrModel, IrOperation, IrParameter, IrService, IrType } from '../../ir';
import { TypeHelper } from '../helpers/type.helper';
import { AstPrinter, IAstPrintedFile } from './core/ast-printer';
import { DecoratorBuilder } from './core/decorator-builder';
import { HeaderGenerator } from './core/header-generator';
import { ImportBuilder } from './core/import-builder';
import { InlineParameterDef, ParameterBuilder } from './core/parameter-builder';
import { ServiceMethodBuilder } from './core/service-method-builder';
import { QueryParamMeta, ServiceStatementBuilder } from './core/service-statement-builder';
import { TypeBuilder, isPrimitiveTypeName } from './core/type-builder';

export class ServiceWriter {
  constructor(
    private readonly printer: AstPrinter,
    private readonly headerGenerator: HeaderGenerator,
    private readonly importBuilder: ImportBuilder,
    private readonly typeBuilder: TypeBuilder,
    private readonly decoratorBuilder: DecoratorBuilder,
    private readonly parameterBuilder: ParameterBuilder,
    private readonly methodBuilder: ServiceMethodBuilder,
    private readonly statementBuilder: ServiceStatementBuilder,
  ) {}

  public async write(
    service: IrService,
    allModels: IrModel[],
    cliVersion: string,
    specTitle: string,
    specVersion: string,
  ): Promise<IAstPrintedFile> {
    const customTypeImports = new Set<string>();
    const rxjsImports = new Set<string>(['Observable', 'firstValueFrom']);
    const nestCommonImports = new Set<string>(['Injectable']);
    const nestAxiosImports = new Set<string>(['HttpService']);
    const axiosImports = new Set<string>(['AxiosResponse']);
    const modelRegistry = new Map(allModels.map((m) => [m.name, m]));

    const classElements: ts.ClassElement[] = [];

    classElements.push(this.buildConstructor());

    for (const operation of service.operations.values()) {
      const { observableMethod, promiseMethod } = this.buildOperationMethods(
        operation,
        customTypeImports,
      );

      classElements.push(observableMethod);
      classElements.push(promiseMethod);
    }

    const classNode = ts.factory.createClassDeclaration(
      [
        this.decoratorBuilder.create('Injectable'),
        ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
      ],
      ts.factory.createIdentifier(service.name),
      undefined,
      undefined,
      classElements,
    );

    const importNodes: ts.ImportDeclaration[] = [];
    importNodes.push(
      this.importBuilder.createNamedImport('@nestjs/common', Array.from(nestCommonImports)),
    );
    importNodes.push(
      this.importBuilder.createNamedImport('@nestjs/axios', Array.from(nestAxiosImports)),
    );
    importNodes.push(
      this.importBuilder.createNamedImport('../api.configuration', ['ApiConfiguration']),
    );
    importNodes.push(
      this.importBuilder.createNamedImport('../request-builder.service', ['RequestBuilder']),
    );

    importNodes.push(this.importBuilder.createNamedImport('rxjs', Array.from(rxjsImports)));
    importNodes.push(this.importBuilder.createNamedImport('axios', Array.from(axiosImports)));

    if (ServiceWriter.serviceUsesFileUploads(service)) {
      importNodes.push(this.importBuilder.createNamedImport('fs', ['ReadStream']));
    }

    // TODO: This logic is duplicated in the model writer. Refactor to a shared utility that both writers can use to determine necessary imports based on used types.
    if (customTypeImports.size > 0) {
      const sortedCustomImports = Array.from(customTypeImports).sort();
      for (const customType of sortedCustomImports) {
        if (customType === service.name) continue;

        const referencedModel = modelRegistry.get(customType);
        if (!referencedModel) continue;

        const suffix = referencedModel.isEnum ? '.enum' : '.dto';
        const importFileName = `../dto/${referencedModel.fileName}${suffix}`;
        importNodes.push(this.importBuilder.createNamedImport(importFileName, [customType]));
      }
    }

    const emptyLineNode = ts.factory.createIdentifier('\n');
    const fileNodes = [...importNodes, emptyLineNode, classNode];
    const nodesWithHeader = this.headerGenerator.addHeader(
      fileNodes,
      cliVersion,
      specTitle,
      specVersion,
    );

    const fileName = `${service.fileName}.ts`;

    return this.printer.print(nodesWithHeader, fileName);
  }

  private static serviceUsesFileUploads(service: IrService): boolean {
    for (const [, operation] of service.operations) {
      for (const param of operation.parameters) {
        const rawType = param.type.rawType;
        if (typeof rawType === 'string' && rawType.includes('ReadStream')) {
          return true;
        }
      }
    }
    return false;
  }

  private buildConstructor(): ts.ConstructorDeclaration {
    const makeParam = (name: string, type: string): ts.ParameterDeclaration =>
      ts.factory.createParameterDeclaration(
        [
          ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword),
          ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword),
        ],
        undefined,
        ts.factory.createIdentifier(name),
        undefined,
        this.typeBuilder.createReference(type),
      );

    return ts.factory.createConstructorDeclaration(
      undefined,
      [
        makeParam('httpService', 'HttpService'),
        makeParam('config', 'ApiConfiguration'),
        makeParam('rb', 'RequestBuilder'),
      ],
      ts.factory.createBlock([]),
    );
  }

  private buildOperationMethods(
    operation: IrOperation,
    customTypeImports: Set<string>,
  ): { observableMethod: ts.MethodDeclaration; promiseMethod: ts.MethodDeclaration } {
    const pathParams = operation.parameters.filter((p: IrParameter) => p.in === 'path');
    const bodyParams = operation.parameters.filter((p: IrParameter) => p.in === 'body');
    const queryParams = operation.parameters.filter((p: IrParameter) => p.in === 'query');
    const headerParams = operation.parameters.filter((p: IrParameter) => p.in === 'header');

    const methodParams: ts.ParameterDeclaration[] = [];
    const callArgs: string[] = [];

    const requiredBodyParams = bodyParams.filter((p) => p.isRequired);
    const optionalBodyParams = bodyParams.filter((p) => !p.isRequired);

    let bodyVar: string | undefined = undefined;

    for (const p of requiredBodyParams) {
      methodParams.push(
        this.parameterBuilder.buildRegular(
          p.name,
          this.mapIrType(p.type, customTypeImports),
          false,
        ),
      );
      callArgs.push(p.name);
      bodyVar = p.name;
    }

    for (const p of pathParams) {
      methodParams.push(
        this.parameterBuilder.buildRegular(
          p.name,
          this.mapIrType(p.type, customTypeImports),
          !p.isRequired,
        ),
      );
      callArgs.push(p.name);
    }

    for (const p of optionalBodyParams) {
      methodParams.push(
        this.parameterBuilder.buildRegular(p.name, this.mapIrType(p.type, customTypeImports), true),
      );
      callArgs.push(p.name);
      bodyVar = p.name;
    }

    const toInlineDef = (p: IrParameter): InlineParameterDef => ({
      name: p.name,
      typeNode: this.mapIrType(p.type, customTypeImports),
      isOptional: !p.isRequired,
      description: p.description,
    });
    const queryProps: InlineParameterDef[] = queryParams.map(toInlineDef);
    const headerProps: InlineParameterDef[] = headerParams.map(toInlineDef);

    const paramsParam = this.parameterBuilder.buildSplitParams(
      'params',
      queryProps,
      headerProps,
      true,
    );
    if (paramsParam) {
      methodParams.push(paramsParam);
      callArgs.push('params');
    }

    const queryParamNames = queryParams.map((p) => p.name);
    const headerParamNames = headerParams.map((p) => p.name);
    const pathParamNames = pathParams.map((p) => p.name);

    const queryParamMeta: Record<string, QueryParamMeta> = {};
    for (const p of queryParams) {
      if (p.style !== undefined || p.explode !== undefined) {
        queryParamMeta[p.name] = { style: p.style, explode: p.explode };
      }
    }

    const isFormData =
      operation.requestContentType === 'multipart/form-data' ||
      operation.requestContentType === 'application/x-www-form-urlencoded';

    const baseReturnTypeNode = this.mapIrType(
      operation.returnType || { rawType: 'any', isPrimitive: true, isArray: false },
      customTypeImports,
    );

    const urlStatements = this.statementBuilder.buildUrlStatements(operation.path, pathParamNames);
    const httpCallStatements = this.statementBuilder.buildHttpCall({
      httpMethod: operation.method,
      bodyVar,
      queryParams: queryParamNames,
      queryParamMeta: Object.keys(queryParamMeta).length > 0 ? queryParamMeta : undefined,
      headerParams: headerParamNames,
      hasOptionalParams: paramsParam !== null,
      acceptHeader: operation.acceptHeader,
      contentTypeHeader: operation.requestContentType,
      responseType: operation.responseType,
      isFormData,
      returnType: baseReturnTypeNode,
    });

    const observableReturnTypeNode = this.typeBuilder.createReference('Observable', [
      this.typeBuilder.createReference('AxiosResponse', [baseReturnTypeNode]),
    ]);

    const observableMethod = this.methodBuilder.build(
      `${operation.methodName}$`,
      methodParams,
      observableReturnTypeNode,
      ts.factory.createBlock([...urlStatements, ...httpCallStatements], true),
      operation.description,
    );

    const promiseReturnTypeNode = this.typeBuilder.createReference('Promise', [baseReturnTypeNode]);
    const promiseReturnStatement = this.statementBuilder.buildPromiseReturn(
      `${operation.methodName}$`,
      callArgs,
      baseReturnTypeNode,
    );

    const promiseMethod = this.methodBuilder.build(
      operation.methodName,
      methodParams,
      promiseReturnTypeNode,
      ts.factory.createBlock([promiseReturnStatement], true),
      operation.description,
    );

    return { observableMethod, promiseMethod };
  }

  private mapIrType(irType: IrType, customImports: Set<string>): ts.TypeNode {
    const rawTypes = Array.isArray(irType.rawType) ? irType.rawType : [irType.rawType];

    const typeNodes = rawTypes.map((typeName) => {
      // Literal union (anonymous string enum from OpenAPI): the entries are
      // literal values, not TypeScript type names — emit them as `'value'`.
      if (irType.composition === 'union' && irType.isPrimitive) {
        return this.typeBuilder.createStringLiteral(typeName);
      }
      if (irType.isPrimitive) {
        return this.typeBuilder.createPrimitive(isPrimitiveTypeName(typeName) ? typeName : 'any');
      }
      if (TypeHelper.needsImport(irType)) {
        customImports.add(typeName);
      }
      return this.typeBuilder.createReference(typeName);
    });

    let baseTypeNode: ts.TypeNode;
    if (typeNodes.length > 1) {
      baseTypeNode =
        irType.composition === 'intersection'
          ? this.typeBuilder.createIntersection(typeNodes)
          : this.typeBuilder.createUnion(typeNodes);
    } else {
      baseTypeNode = typeNodes[0];
    }

    // Collect imports from inline object types (e.g., multipart bodies)
    if (irType.referencedTypes) {
      for (const refType of irType.referencedTypes) {
        customImports.add(refType);
      }
    }

    if (irType.isArray) {
      return this.typeBuilder.createArray(baseTypeNode);
    }
    return baseTypeNode;
  }
}
