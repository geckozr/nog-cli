import { Project } from 'ts-morph';

import { toKebabCase } from '../../../utils/naming';
import { IrDefinition } from '../../ir/interfaces';
import { FileHeaderHelper } from '../helpers/file-header.helper';
import { TypeHelper } from '../helpers/type.helper';

/**
 * Generates the primary NestJS module that wires generated services.
 *
 * Responsibilities:
 * - Imports `HttpModule` from `@nestjs/common` for HTTP client support.
 * - Registers all generated services as providers and exports.
 * - Applies the `@Module` decorator with dependency injection metadata.
 * - Emits filename using kebab-case from moduleName (e.g., `MyCustomSdk` → `my-custom-sdk.module.ts`) with class name `${moduleName}Module`.
 */
export class ModuleWriter {
  /**
   * Instantiates the module writer.
   *
   * @param project - The ts-morph Project instance for AST manipulation.
   * @param outputDir - The target directory where the module file will be written.
   * @param moduleName - The name stem for the module class (e.g., `MyCustom` becomes `MyCustomModule` with file `my-custom.module.ts`). Defaults to `'Api'` (class `ApiModule`, file `api-module.module.ts`).
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
   * Generates the NestJS module file.
   *
   * Creates `${outputDir}/${kebab-case(moduleName)}.module.ts` containing:
   * - Import of `HttpModule` and all generated services.
   * - Class declaration named `${moduleName}Module` decorated with `@Module` metadata (imports, providers, exports).
   * - Standard generated file header with CLI version and spec metadata.
   *
   * @param ir - The Internal Representation containing the list of services to wire.
   * @returns Promise resolving when the module file has been persisted to the ts-morph project.
   */
  async write(ir: IrDefinition): Promise<void> {
    const fileName = `${toKebabCase(this.moduleName)}.module.ts`;
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/${fileName}`, '', {
      overwrite: true,
    });

    // Import NestJS dependencies
    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/common',
      namedImports: ['Module'],
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/axios',
      namedImports: ['HttpModule'],
    });

    // Import all services
    const serviceNames = ir.services.map((s) => s.name);

    for (const serviceName of serviceNames) {
      const serviceFileName = TypeHelper.getFileName(serviceName);
      sourceFile.addImportDeclaration({
        moduleSpecifier: `./services/${serviceFileName}.service`,
        namedImports: [serviceName],
      });
    }

    // Create the Module Class with @Module decorator
    sourceFile.addClass({
      name: `${this.moduleName}Module`,
      isExported: true,
      decorators: [
        {
          name: 'Module',
          arguments: [
            (writer) => {
              writer.write('{');
              writer.newLine();
              writer.indent(() => {
                writer.write('imports: [HttpModule],');
                writer.newLine();
                writer.write(`providers: [${serviceNames.join(', ')}],`);
                writer.newLine();
                writer.write(`exports: [${serviceNames.join(', ')}],`);
              });
              writer.newLine();
              writer.write('}');
            },
          ],
        },
      ],
    });

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }
}
