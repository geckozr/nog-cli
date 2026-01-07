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

    // Add Constructor with HttpService and ApiConfiguration injection
    classDecl.addConstructor({
      parameters: [
        {
          name: 'httpService',
          type: 'HttpService',
          scope: Scope.Private,
          isReadonly: true,
        },
        {
          name: 'config',
          type: 'ApiConfiguration',
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
   * Returns the full AxiosResponse which includes headers, status, and other HTTP metadata.
   * Use this method when you need access to response headers or HTTP status information.
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
      returnType: `Observable<AxiosResponse<${returnType}>>`,
      docs: operation.description ? [{ description: operation.description }] : undefined,
    });

    this.generateMethodBody(method, operation);
  }

  /**
   * Adds the Promise-based convenience method delegating to the Observable sibling via `firstValueFrom`.
   *
   * Automatically extracts the response data, providing convenient access to just the response body.
   * Use this method for simple async/await patterns when you only need the response data.
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

    this.generatePromiseMethodBody(method, operation);
  }

  /**
   * Prepares method parameters and return type.
   *
   * Parameter grouping strategy (TypeScript requires required params before optional):
   * 1. Required body parameter (if exists)
   * 2. Required path parameters as individual arguments
   * 3. Optional body parameter (if exists)
   * 4. Params object (groups optional path, query, and header parameters - always optional)
   *
   * @param operation Operation metadata containing parameters and return type.
   * @returns Method signature details for ts-morph.
   */
  private getMethodSignature(operation: IrOperation): {
    parameters: { name: string; type: string; hasQuestionToken: boolean }[];
    returnType: string;
  } {
    const pathParams = operation.parameters.filter((p) => p.in === 'path');
    const bodyParams = operation.parameters.filter((p) => p.in === 'body');
    const queryParams = operation.parameters.filter((p) => p.in === 'query');
    const headerParams = operation.parameters.filter((p) => p.in === 'header');

    const parameters: { name: string; type: string; hasQuestionToken: boolean }[] = [];

    // Separate required and optional body params
    const requiredBodyParams = bodyParams.filter((p) => p.isRequired);
    const optionalBodyParams = bodyParams.filter((p) => !p.isRequired);

    // 1. Required body parameter (must come before optional params)
    parameters.push(
      ...requiredBodyParams.map((p) => ({
        name: p.name,
        type: TypeHelper.irTypeToString(p.type),
        hasQuestionToken: false,
      })),
    );

    // 2. Required path parameters as individual arguments
    const requiredPathParams = pathParams.filter((p) => p.isRequired);
    parameters.push(
      ...requiredPathParams.map((p) => ({
        name: p.name,
        type: TypeHelper.irTypeToString(p.type),
        hasQuestionToken: false,
      })),
    );

    // 3. Optional body parameter (after all required params)
    parameters.push(
      ...optionalBodyParams.map((p) => ({
        name: p.name,
        type: TypeHelper.irTypeToString(p.type),
        hasQuestionToken: true,
      })),
    );

    // 3. Params object: groups optional path params, all query, and all header parameters with inline JSDoc
    const optionalPathParams = pathParams.filter((p) => !p.isRequired);
    const paramsObjectParams = [...optionalPathParams, ...queryParams, ...headerParams];

    if (paramsObjectParams.length > 0) {
      const paramsObjectProperties = paramsObjectParams
        .map((p) => {
          const type = TypeHelper.irTypeToString(p.type);
          const optional = !p.isRequired ? '?' : '';

          // Add JSDoc comment for the field if description exists
          let fieldDef = '';
          if (p.description) {
            // Escape any */ sequences in description to prevent breaking JSDoc
            const escapedDescription = p.description.replace(/\*\//g, '*\\/');
            fieldDef = `\n    /** ${escapedDescription} */\n    ${p.name}${optional}: ${type}`;
          } else {
            fieldDef = `\n    ${p.name}${optional}: ${type}`;
          }
          return fieldDef;
        })
        .join(';');

      parameters.push({
        name: 'params',
        type: `{${paramsObjectProperties};\n  }`,
        hasQuestionToken: true,
      });
    }

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
      const pathParams = operation.parameters.filter((p) => p.in === 'path');
      const queryParams = operation.parameters.filter((p) => p.in === 'query');
      const headerParams = operation.parameters.filter((p) => p.in === 'header');
      const bodyParam = operation.parameters.find((p) => p.in === 'body');

      const requiredPathParams = pathParams.filter((p) => p.isRequired);
      const optionalPathParams = pathParams.filter((p) => !p.isRequired);

      // 1. URL Construction - build path with interpolated path params
      let urlTemplate = operation.path;

      // Replace required path params (direct arguments)
      for (const param of requiredPathParams) {
        urlTemplate = urlTemplate.replace(`{${param.name}}`, `\${${param.name}}`);
      }

      // Replace optional path params (from params object)
      for (const param of optionalPathParams) {
        urlTemplate = urlTemplate.replace(`{${param.name}}`, `\${params?.${param.name}}`);
      }

      writer.writeLine("const normalizedBase = (this.config.baseUrl ?? '').replace(/\\/$/, '');");
      writer.writeLine(`const normalizedPath = \`${urlTemplate}\`.replace(/^\\//, '');`);
      writer.writeLine(
        'const url = normalizedBase ? `${normalizedBase}/${normalizedPath}` : `/${normalizedPath}`;',
      );

      // 2. Query Params - extract from params object
      if (queryParams.length > 0) {
        writer.writeLine('const queryParams: Record<string, any> = {};');
        writer.writeLine('if (params) {');
        writer.indent(() => {
          for (const param of queryParams) {
            writer.writeLine(
              `if (params.${param.name} !== undefined) queryParams['${param.name}'] = params.${param.name};`,
            );
          }
        });
        writer.writeLine('}');
      }

      // 3. Headers - merge global headers, content-type, accept, and custom headers
      writer.writeLine(
        'const headers: Record<string, string> = { ...(this.config.headers ?? {}) };',
      );

      // Add Accept header if specified
      if (operation.acceptHeader) {
        writer.writeLine(`headers['Accept'] = '${operation.acceptHeader}';`);
      }

      // Add Content-Type header if specified (for multipart/form-data, etc)
      if (operation.requestContentType && operation.requestContentType !== 'application/json') {
        // For multipart/form-data, we'll let the browser/axios set it with boundaries
        // For other types, set explicitly
        if (operation.requestContentType !== 'multipart/form-data') {
          writer.writeLine(`headers['Content-Type'] = '${operation.requestContentType}';`);
        }
      }

      // Extract custom headers from params object
      if (headerParams.length > 0) {
        writer.writeLine('if (params) {');
        writer.indent(() => {
          for (const param of headerParams) {
            writer.writeLine(
              `if (params['${param.name}'] !== undefined) headers['${param.name}'] = String(params['${param.name}']);`,
            );
          }
        });
        writer.writeLine('}');
      }

      // 4. HTTP Call
      const httpMethod = operation.method.toLowerCase();
      const returnType = TypeHelper.irTypeToString(operation.returnType);

      // Build config object - spread httpOptions for Axios settings (timeout, etc.)
      const configParts: string[] = [];

      configParts.push('...this.config.httpOptions');

      if (queryParams.length > 0) {
        configParts.push('params: queryParams');
      }

      configParts.push('headers');

      // Add responseType for non-JSON responses
      if (operation.responseType) {
        configParts.push(`responseType: '${operation.responseType}'`);
      }

      const configObj = `{ ${configParts.join(', ')} }`;

      let httpCall = '';
      if (['get', 'delete', 'head', 'options'].includes(httpMethod)) {
        // Methods without body: (url, config)
        httpCall = `this.httpService.${httpMethod}<${returnType}>(url, ${configObj})`;
      } else {
        // Methods with body: (url, data, config)
        let bodyArg = bodyParam ? bodyParam.name : 'undefined';

        // For multipart/form-data, convert body to FormData only if it exists
        if (operation.requestContentType === 'multipart/form-data' && bodyParam) {
          // Use conditional to avoid creating empty FormData when body is undefined
          bodyArg = `${bodyParam.name} ? toFormData(${bodyParam.name}) : undefined`;
        }

        httpCall = `this.httpService.${httpMethod}<${returnType}>(url, ${bodyArg}, ${configObj})`;
      }

      // Observable method returns full AxiosResponse (includes headers, status, etc.)
      // This is the actual return line for the Observable method
      writer.writeLine(`return ${httpCall};`);
    });
  }

  /**
   * Wraps the Observable method with firstValueFrom and extracts the data.
   * The Promise method allows convenient access to just the response data.
   *
   * @param method The Promise method declaration being populated.
   * @param operation Operation metadata describing the HTTP call.
   * @returns void
   */
  private generatePromiseMethodBody(method: MethodDeclaration, operation: IrOperation): void {
    method.setBodyText((writer) => {
      const args = this.buildMethodCallArguments(operation);
      writer.writeLine(
        `return firstValueFrom(this.${operation.methodName}$(${args})).then(response => response.data);`,
      );
    });
  }

  /**
   * Builds the arguments list for calling the Observable method from the Promise wrapper.
   *
   * @param operation Operation metadata describing the HTTP call.
   * @returns Comma-separated argument string.
   */
  private buildMethodCallArguments(operation: IrOperation): string {
    const pathParams = operation.parameters.filter((p) => p.in === 'path');
    const bodyParams = operation.parameters.filter((p) => p.in === 'body');
    const queryParams = operation.parameters.filter((p) => p.in === 'query');
    const headerParams = operation.parameters.filter((p) => p.in === 'header');

    const args: string[] = [];

    // Required body
    const requiredBodyParams = bodyParams.filter((p) => p.isRequired);
    args.push(...requiredBodyParams.map((p) => p.name));

    // Required path params
    const requiredPathParams = pathParams.filter((p) => p.isRequired);
    args.push(...requiredPathParams.map((p) => p.name));

    // Optional body or params object (if any exist)
    const optionalBodyParams = bodyParams.filter((p) => !p.isRequired);
    if (optionalBodyParams.length > 0) {
      args.push(...optionalBodyParams.map((p) => p.name));
    }

    const optionalPathParams = pathParams.filter((p) => !p.isRequired);
    if (optionalPathParams.length > 0 || queryParams.length > 0 || headerParams.length > 0) {
      args.push('params');
    }

    return args.join(', ');
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
