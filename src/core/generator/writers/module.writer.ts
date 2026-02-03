import { Project, VariableDeclarationKind } from 'ts-morph';

import { IrDefinition } from '../../ir/interfaces';
import { FileHeaderHelper } from '../helpers/file-header.helper';
import { TypeHelper } from '../helpers/type.helper';

/**
 * Generates the primary NestJS module that wires generated services.
 *
 * Responsibilities:
 * - Emits a dynamic NestJS module with `forRoot`/`forRootAsync` supporting runtime configuration (baseUrl, headers).
 * - Registers `HttpModule` with axios config derived from provided options.
 * - Provides `API_CONFIG` token and `ApiConfiguration` service for downstream consumers.
 * - Registers all generated services as providers and exports.
 * - Emits the module file as `api.module.ts` with class name `${moduleName}Module`.
 */
export class ModuleWriter {
  /**
   * Instantiates the module writer.
   *
   * @param project - The ts-morph Project instance for AST manipulation.
   * @param outputDir - The target directory where the module file will be written.
   * @param moduleName - The name stem for the module class (e.g., `MyCustom` becomes `MyCustomModule`). Defaults to `'Api'`.
   * @param specTitle - The OpenAPI specification title for file header metadata.
   * @param specVersion - The OpenAPI specification version for file header metadata.
   */
  constructor(
    private readonly project: Project,
    private readonly outputDir: string,
    private readonly moduleName: string = 'Api',
    private readonly specTitle: string = 'Unknown Spec',
    private readonly specVersion: string = 'Unknown Version',
  ) {}

  /**
   * Generates the NestJS module file and supporting configuration files.
   *
   * Creates:
   * - `${outputDir}/api.module.ts` – Dynamic module with `forRoot` and `forRootAsync`
   * - `${outputDir}/api.types.ts` – Configuration interfaces and token
   * - `${outputDir}/api.configuration.ts` – ApiConfiguration service
   * - `${outputDir}/api.utils.ts` – Utility functions (toFormData)
   *
   * @param ir - The Internal Representation containing the list of services to wire.
   * @returns Promise resolving when all files are written.
   */
  async write(ir: IrDefinition): Promise<void> {
    // Generate ancillary files
    await this.writeTypesFile();
    await this.writeConfigurationFile();
    await this.writeUtilsFile();

    const fileName = 'api.module.ts';
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/${fileName}`, '', {
      overwrite: true,
    });

    const serviceNames = ir.services.map((s) => s.name);

    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/common',
      namedImports: ['Module', 'DynamicModule', 'Provider', 'Type'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/axios',
      namedImports: ['HttpModule'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: './api.configuration',
      namedImports: ['ApiConfiguration'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: './api.types',
      namedImports: [
        'API_CONFIG',
        'ApiModuleAsyncConfig',
        'ApiModuleConfig',
        'ApiModuleConfigFactory',
      ],
    });

    for (const serviceName of serviceNames) {
      const serviceFileName = TypeHelper.getFileName(serviceName);
      sourceFile.addImportDeclaration({
        moduleSpecifier: `./services/${serviceFileName}.service`,
        namedImports: [serviceName],
      });
    }

    const className = `${this.moduleName}Module`;

    const moduleClass = sourceFile.addClass({
      name: className,
      isExported: true,
      decorators: [
        {
          name: 'Module',
          arguments: ['{}'],
        },
      ],
    });

    moduleClass.addMethod({
      name: 'forRoot',
      isStatic: true,
      parameters: [
        {
          name: 'config',
          type: 'ApiModuleConfig = {}',
        },
      ],
      returnType: 'DynamicModule',
      statements: (writer) => {
        writer.writeLine('const providers: Provider[] = [');
        writer.indent(() => {
          writer.writeLine('ApiConfiguration,');
          for (const serviceName of serviceNames) {
            writer.writeLine(`${serviceName},`);
          }
          writer.writeLine('{');
          writer.indent(() => {
            writer.writeLine('provide: API_CONFIG,');
            writer.writeLine('useValue: config ?? {},');
          });
          writer.writeLine('},');
        });
        writer.writeLine('];');
        writer.blankLine();
        writer.writeLine('return {');
        writer.indent(() => {
          writer.writeLine(`module: ${className},`);
          writer.writeLine('imports: [');
          writer.indent(() => {
            writer.writeLine('HttpModule.register({');
            writer.indent(() => {
              writer.writeLine("baseURL: config.baseUrl ?? '',");
              writer.writeLine('headers: config.headers ?? {},');
            });
            writer.writeLine('}),');
          });
          writer.writeLine('],');
          writer.writeLine('providers,');
          writer.writeLine(`exports: [ApiConfiguration, ${serviceNames.join(', ')}],`);
        });
        writer.writeLine('};');
      },
    });

    moduleClass.addMethod({
      name: 'forRootAsync',
      isStatic: true,
      parameters: [
        {
          name: 'options',
          type: 'ApiModuleAsyncConfig',
        },
      ],
      returnType: 'DynamicModule',
      statements: (writer) => {
        writer.writeLine('const asyncProviders = createAsyncProviders(options);');
        writer.writeLine('const imports = options.imports ?? [];');
        writer.blankLine();
        writer.writeLine('return {');
        writer.indent(() => {
          writer.writeLine(`module: ${className},`);
          writer.writeLine('imports: [');
          writer.indent(() => {
            writer.writeLine('...imports,');
            writer.writeLine('HttpModule.registerAsync({');
            writer.indent(() => {
              writer.writeLine('imports,');
              writer.writeLine('inject: [API_CONFIG],');
              writer.writeLine('extraProviders: asyncProviders,');
              writer.writeLine('useFactory: async (config: ApiModuleConfig) => ({');
              writer.indent(() => {
                writer.writeLine("baseURL: config?.baseUrl ?? '',");
                writer.writeLine('headers: config?.headers ?? {},');
              });
              writer.writeLine('}),');
            });
            writer.writeLine('}),');
          });
          writer.writeLine('],');
          writer.writeLine('providers: [ApiConfiguration, ...asyncProviders,');
          writer.indent(() => {
            for (const serviceName of serviceNames) {
              writer.writeLine(`${serviceName},`);
            }
          });
          writer.writeLine('],');
          writer.writeLine('exports: [ApiConfiguration,');
          writer.indent(() => {
            for (const serviceName of serviceNames) {
              writer.writeLine(`${serviceName},`);
            }
          });
          writer.writeLine('],');
        });
        writer.writeLine('};');
      },
    });

    sourceFile.addFunction({
      name: 'createAsyncProviders',
      isExported: false,
      parameters: [{ name: 'options', type: 'ApiModuleAsyncConfig' }],
      returnType: 'Provider[]',
      statements: (writer) => {
        writer.writeLine('if (options.useFactory) {');
        writer.indent(() => {
          writer.writeLine('return [');
          writer.indent(() => {
            writer.writeLine('{');
            writer.indent(() => {
              writer.writeLine('provide: API_CONFIG,');
              writer.writeLine('useFactory: options.useFactory,');
              writer.writeLine('inject: options.inject ?? [],');
            });
            writer.writeLine('},');
            writer.writeLine('...(options.extraProviders ?? []),');
          });
          writer.writeLine('];');
        });
        writer.writeLine('}');
        writer.blankLine();
        writer.writeLine(
          'const inject: Array<Type<ApiModuleConfigFactory> | string | symbol> = [];',
        );
        writer.writeLine('if (options.useExisting) inject.push(options.useExisting);');
        writer.writeLine('if (options.useClass) inject.push(options.useClass);');
        writer.blankLine();
        writer.writeLine('const asyncProvider: Provider = {');
        writer.indent(() => {
          writer.writeLine('provide: API_CONFIG,');
          writer.writeLine(
            'useFactory: async (factory: ApiModuleConfigFactory) => factory.createApiModuleConfig(),',
          );
          writer.writeLine('inject,');
        });
        writer.writeLine('};');
        writer.blankLine();
        writer.writeLine(
          'const providers: Provider[] = [asyncProvider, ...(options.extraProviders ?? [])];',
        );
        writer.writeLine('if (options.useClass) {');
        writer.indent(() => {
          writer.writeLine(
            'providers.unshift({ provide: options.useClass, useClass: options.useClass });',
          );
        });
        writer.writeLine('}');
        writer.writeLine('return providers;');
      },
    });

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  private async writeTypesFile(): Promise<void> {
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/api.types.ts`, '', {
      overwrite: true,
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/common',
      namedImports: ['ModuleMetadata', 'Provider', 'Type'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: 'axios',
      namedImports: ['AxiosRequestConfig'],
    });

    sourceFile.addTypeAlias({
      name: 'ApiHeaders',
      type: 'Record<string, string>',
      isExported: true,
    });

    sourceFile.addInterface({
      name: 'ApiModuleConfig',
      isExported: true,
      properties: [
        { name: 'baseUrl?', type: 'string' },
        { name: 'headers?', type: 'ApiHeaders' },
        { name: 'httpOptions?', type: 'AxiosRequestConfig' },
      ],
    });

    sourceFile.addInterface({
      name: 'ApiModuleConfigFactory',
      isExported: true,
      methods: [
        {
          name: 'createApiModuleConfig',
          returnType: 'Promise<ApiModuleConfig> | ApiModuleConfig',
        },
      ],
    });

    sourceFile.addInterface({
      name: 'ApiModuleAsyncConfig',
      isExported: true,
      extends: ['Pick<ModuleMetadata, "imports">'],
      properties: [
        { name: 'useExisting?', type: 'Type<ApiModuleConfigFactory>' },
        { name: 'useClass?', type: 'Type<ApiModuleConfigFactory>' },
        {
          name: 'useFactory?',
          type: '(...args: unknown[]) => Promise<ApiModuleConfig> | ApiModuleConfig',
        },
        { name: 'inject?', type: 'Array<string | symbol | Type<unknown>>' },
        { name: 'extraProviders?', type: 'Provider[]' },
      ],
    });

    sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'API_CONFIG',
          initializer: 'Symbol("API_CONFIG")',
        },
      ],
      isExported: true,
    });

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  private async writeConfigurationFile(): Promise<void> {
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/api.configuration.ts`, '', {
      overwrite: true,
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/common',
      namedImports: ['Injectable', 'Inject'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: 'axios',
      namedImports: ['AxiosRequestConfig'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: './api.types',
      namedImports: ['API_CONFIG', 'ApiModuleConfig', 'ApiHeaders'],
    });

    const cls = sourceFile.addClass({
      name: 'ApiConfiguration',
      isExported: true,
      decorators: [{ name: 'Injectable', arguments: [] }],
    });

    cls.addConstructor({
      parameters: [
        {
          name: 'config',
          type: 'ApiModuleConfig',
          hasQuestionToken: true,
          decorators: [{ name: 'Inject', arguments: ['API_CONFIG'] }],
          scope: undefined,
          isReadonly: true,
        },
      ],
      statements: ['this.config = config ?? {};'],
    });

    cls.addGetAccessor({
      name: 'baseUrl',
      returnType: 'string',
      statements: ["return this.config?.baseUrl ?? '';"],
    });

    cls.addGetAccessor({
      name: 'headers',
      returnType: 'ApiHeaders',
      statements: ['return this.config?.headers ?? {};'],
    });

    cls.addGetAccessor({
      name: 'httpOptions',
      returnType: 'AxiosRequestConfig',
      statements: ['return this.config?.httpOptions ?? {};'],
    });

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  private async writeUtilsFile(): Promise<void> {
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/api.utils.ts`, '', {
      overwrite: true,
    });

    // Import form-data and stream for Node.js
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'form-data',
      namespaceImport: 'FormData',
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: 'stream',
      namedImports: ['Readable'],
    });

    // Add JSDoc and toFormData function
    sourceFile.addStatements((writer) => {
      writer.writeLine('/**');
      writer.writeLine(' * Converts an object to FormData for multipart/form-data requests.');
      writer.writeLine(' * Handles Buffer, Readable streams, and nested objects.');
      writer.writeLine(' *');
      writer.writeLine(' * For file uploads, you can pass:');
      writer.writeLine(' * - A Buffer directly: { image: buffer } (filename = field name)');
      writer.writeLine(
        " * - A ReadStream: { image: fs.createReadStream('file.jpg') } (auto-detects filename and Content-Type)",
      );
      writer.writeLine(
        " * - An object with metadata: { image: { buffer: Buffer, filename: 'file.jpg', contentType?: 'image/jpeg' } }",
      );
      writer.writeLine(' *');
      writer.writeLine(' * @param obj - Object to convert to FormData');
      writer.writeLine(' * @returns FormData instance');
      writer.writeLine(' */');
      writer.writeLine('export function toFormData(obj: Record<string, any>): FormData {');
      writer.indent(() => {
        writer.writeLine('const formData = new FormData();');
        writer.blankLine();
        writer.writeLine('for (const [key, value] of Object.entries(obj)) {');
        writer.indent(() => {
          writer.writeLine('if (value === undefined || value === null) {');
          writer.indent(() => {
            writer.writeLine('continue;');
          });
          writer.writeLine('}');
          writer.blankLine();
          writer.writeLine('if (Buffer.isBuffer(value)) {');
          writer.indent(() => {
            writer.writeLine(
              '// Binary data (file content) - form-data will detect Content-Type from filename',
            );
            writer.writeLine('formData.append(key, value, key);');
          });
          writer.writeLine('} else if (value instanceof Readable) {');
          writer.indent(() => {
            writer.writeLine('// Stream data');
            writer.writeLine('formData.append(key, value, key);');
          });
          writer.writeLine(
            "} else if (typeof value === 'object' && value.buffer && Buffer.isBuffer(value.buffer)) {",
          );
          writer.indent(() => {
            writer.writeLine('// Object with buffer and optional metadata');
            writer.writeLine('const options: any = {');
            writer.indent(() => {
              writer.writeLine('filename: value.filename || key,');
            });
            writer.writeLine('};');
            writer.writeLine('if (value.contentType) {');
            writer.indent(() => {
              writer.writeLine('options.contentType = value.contentType;');
            });
            writer.writeLine('}');
            writer.writeLine('formData.append(key, value.buffer, options);');
          });
          writer.writeLine('} else if (Array.isArray(value)) {');
          writer.indent(() => {
            writer.writeLine('// Array values');
            writer.writeLine('for (const item of value) {');
            writer.indent(() => {
              writer.writeLine('if (Buffer.isBuffer(item)) {');
              writer.indent(() => {
                writer.writeLine('formData.append(key, item, key);');
              });
              writer.writeLine('} else {');
              writer.indent(() => {
                writer.writeLine('formData.append(key, String(item));');
              });
              writer.writeLine('}');
            });
            writer.writeLine('}');
          });
          writer.writeLine("} else if (typeof value === 'object') {");
          writer.indent(() => {
            writer.writeLine('// Nested object - serialize as JSON');
            writer.writeLine('formData.append(key, JSON.stringify(value));');
          });
          writer.writeLine('} else {');
          writer.indent(() => {
            writer.writeLine('// Primitive values');
            writer.writeLine('formData.append(key, String(value));');
          });
          writer.writeLine('}');
        });
        writer.writeLine('}');
        writer.blankLine();
        writer.writeLine('return formData;');
      });
      writer.writeLine('}');
    });

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }
}
