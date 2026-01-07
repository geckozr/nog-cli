import { ClassDeclaration, MethodDeclaration, Project, Scope } from 'ts-morph';

import { IrModel, IrOperation, IrService } from '../../ir/interfaces';
import { FileHeaderHelper } from '../helpers/file-header.helper';
import { ImportHelper } from '../helpers/import.helper';
import { TypeHelper } from '../helpers/type.helper';

/**
 * Generates NestJS service classes with dual HTTP transport methods.
 *
 * Dual Method Strategy:
 * - **Observable Method (suffix `$`)**: Issues raw HTTP calls via `HttpService`, returns `Observable<T>`.
 * - **Promise Method**: Wraps the Observable sibling using `firstValueFrom()`, returns `Promise<T>` for convenience.
 *
 * Both methods share the same URL construction, parameter binding, and error handling logic;
 * the Promise variant simply adapts the Observable for async/await patterns.
 *
 * Each service includes:
 * - Dependency injection of `HttpService` via constructor.
 * - Type-safe operation methods derived from OpenAPI operationIds.
 * - JSDoc descriptions from OpenAPI operation summaries.
 * - Standard file header with generation metadata.
 */
export class ServiceWriter {
  /**
   * Instantiates the service writer.
   *
   * @param project - The ts-morph Project instance for AST manipulation.
   * @param outputDir - The target directory where service files will be written.
   * @param allModels - The complete list of IR models (used for type resolution in method signatures).
   * @param specTitle - The OpenAPI specification title for file header metadata.
   * @param specVersion - The OpenAPI specification version for file header metadata.
   */
  constructor(
    private project: Project,
    private outputDir: string,
    private allModels: IrModel[] = [],
    private readonly specTitle: string = 'Unknown Spec',
    private readonly specVersion: string = 'Unknown Version',
  ) {}

  /**
   * Generates all service files based on the provided services list.
   *
   * @param services List of services to generate.
   * @returns Promise resolving when every service file has been written.
   */
  async writeAll(services: IrService[]): Promise<void> {
    for (const service of services) {
      this.writeService(service);
    }
  }

  /**
   * Writes a single service file with both Observable and Promise method variants.
   *
   * @param service The IR service descriptor to emit.
   * @returns void
   */
  private writeService(service: IrService): void {
    const fileName = `${TypeHelper.getFileName(service.name)}.service.ts`;
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/services/${fileName}`, '', {
      overwrite: true,
    });

    // Add necessary imports (NestJS, RxJS, DTOs)
    ImportHelper.addServiceImports(sourceFile, service, this.allModels);

    // Create the Service Class
    const classDecl = sourceFile.addClass({
      name: service.name,
      isExported: true,
      decorators: [
        {
          name: 'Injectable',
          arguments: [],
        },
      ],
    });

    // Add Constructor with HttpService injection
    classDecl.addConstructor({
      parameters: [
        {
          name: 'httpService',
          type: 'HttpService',
          scope: Scope.Private,
          isReadonly: true,
        },
      ],
    });

    // Add Methods for each operation
    for (const [, operation] of service.operations) {
      this.addObservableMethod(classDecl, operation);
      this.addPromiseMethod(classDecl, operation);
    }

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  /**
   * Adds the Observable-based method (suffix `$`) that issues the HTTP request.
   *
   * @param classDecl Target class declaration.
   * @param operation Operation metadata driving the signature and body.
   * @returns void
   */
  private addObservableMethod(classDecl: ClassDeclaration, operation: IrOperation): void {
    const { parameters, returnType } = this.getMethodSignature(operation);

    const method = classDecl.addMethod({
      name: `${operation.methodName}$`,
      scope: Scope.Public,
      parameters,
      returnType: `Observable<${returnType}>`,
      docs: operation.description ? [{ description: operation.description }] : undefined,
    });

    this.generateMethodBody(method, operation);
  }

  /**
   * Adds the Promise-based convenience method delegating to the Observable sibling via `firstValueFrom`.
   *
   * @param classDecl Target class declaration.
   * @param operation Operation metadata driving the signature and body.
   * @returns void
   */
  private addPromiseMethod(classDecl: ClassDeclaration, operation: IrOperation): void {
    const { parameters, returnType } = this.getMethodSignature(operation);

    const method = classDecl.addMethod({
      name: operation.methodName,
      scope: Scope.Public,
      parameters,
      returnType: `Promise<${returnType}>`,
      docs: operation.description ? [{ description: operation.description }] : undefined,
    });

    method.setBodyText((writer) => {
      const args = parameters.map((p) => p.name).join(', ');
      writer.writeLine(`return firstValueFrom(this.${operation.methodName}$(${args}));`);
    });
  }

  /**
   * Prepares method parameters and return type, ordering required parameters before optional ones.
   *
   * @param operation Operation metadata containing parameters and return type.
   * @returns Method signature details for ts-morph.
   */
  private getMethodSignature(operation: IrOperation): {
    parameters: { name: string; type: string; hasQuestionToken: boolean }[];
    returnType: string;
  } {
    const requiredParams = operation.parameters.filter((p) => p.isRequired);
    const optionalParams = operation.parameters.filter((p) => !p.isRequired);

    const parameters = [
      ...requiredParams.map((p) => ({
        name: p.name,
        type: TypeHelper.irTypeToString(p.type),
        hasQuestionToken: false,
      })),
      ...optionalParams.map((p) => ({
        name: p.name,
        type: TypeHelper.irTypeToString(p.type),
        hasQuestionToken: true,
      })),
    ];

    const returnType = TypeHelper.irTypeToString(operation.returnType);

    return { parameters, returnType };
  }

  /**
   * Generates the implementation body for the Observable method, covering URL construction, params, headers, and HTTP invocation.
   *
   * @param method The ts-morph method declaration being populated.
   * @param operation Operation metadata describing the HTTP call.
   * @returns void
   */
  private generateMethodBody(method: MethodDeclaration, operation: IrOperation): void {
    method.setBodyText((writer) => {
      const queryParams = operation.parameters.filter((p) => p.in === 'query');
      const headerParams = operation.parameters.filter((p) => p.in === 'header');
      const bodyParam = operation.parameters.find((p) => p.in === 'body');

      // 1. URL Construction
      const urlTemplate = this.buildUrlTemplate(operation.path);
      writer.writeLine(`const url = \`${urlTemplate}\`;`);

      // 2. Query Params
      if (queryParams.length > 0) {
        writer.writeLine('const params: Record<string, any> = {};');
        for (const param of queryParams) {
          // Add check to avoid sending undefined
          writer.writeLine(
            `if (${param.name} !== undefined) params['${param.name}'] = ${param.name};`,
          );
        }
      }

      // 3. Headers
      if (headerParams.length > 0) {
        writer.writeLine('const headers: Record<string, string> = {};');
        for (const param of headerParams) {
          writer.writeLine(
            `if (${param.name} !== undefined) headers['${param.name}'] = String(${param.name});`,
          );
        }
      }

      // 4. HTTP Call
      const httpMethod = operation.method.toLowerCase();
      const returnType = TypeHelper.irTypeToString(operation.returnType);
      const configParts: string[] = [];

      if (queryParams.length > 0) configParts.push('params');
      if (headerParams.length > 0) configParts.push('headers');

      const configObj = configParts.length > 0 ? `{ ${configParts.join(', ')} }` : '';

      let httpCall = '';
      if (['get', 'delete', 'head', 'options'].includes(httpMethod)) {
        // Methods without body: (url, config)
        httpCall = configObj
          ? `this.httpService.${httpMethod}<${returnType}>(url, ${configObj})`
          : `this.httpService.${httpMethod}<${returnType}>(url)`;
      } else {
        // Methods with body: (url, data, config)
        const bodyArg = bodyParam ? bodyParam.name : 'undefined';
        httpCall = configObj
          ? `this.httpService.${httpMethod}<${returnType}>(url, ${bodyArg}, ${configObj})`
          : `this.httpService.${httpMethod}<${returnType}>(url, ${bodyArg})`;
      }

      writer.writeLine(`return ${httpCall}.pipe(map((response) => response.data));`);
    });
  }

  /**
   * Converts OpenAPI path placeholders to template literal segments (e.g., `/users/{id}` -> `/users/${id}`).
   *
   * @param path The OpenAPI path template.
   * @returns The path rewritten for template literal interpolation.
   */
  private buildUrlTemplate(path: string): string {
    return path.replace(/\{([^}]+)\}/g, '${$1}');
  }
}
