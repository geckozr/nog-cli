import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import packageJson from '../../../package.json';
import { Logger } from '../../utils/logger';
import { IrDefinition } from '../ir/interfaces';
import { TypeHelper } from './helpers/type.helper';
import { ApiConfigurationWriter } from './writers/api-configuration.writer';
import { ApiModuleWriter } from './writers/api-module.writer';
import { ApiTypesWriter } from './writers/api-types.writer';
import { ApiUtilsWriter } from './writers/api-utils.writer';
import { AstPrinter } from './writers/core/ast-printer';
import { CommentModifier } from './writers/core/comment-modifier';
import { DeclarationBuilder } from './writers/core/declaration-builder';
import { DecoratorBuilder } from './writers/core/decorator-builder';
import { ExpressionBuilder } from './writers/core/expression-builder';
import { HeaderGenerator } from './writers/core/header-generator';
import { ImportBuilder } from './writers/core/import-builder';
import { ParameterBuilder } from './writers/core/parameter-builder';
import { PropertyBuilder } from './writers/core/property-builder';
import { ServiceMethodBuilder } from './writers/core/service-method-builder';
import { ServiceStatementBuilder } from './writers/core/service-statement-builder';
import { TypeBuilder } from './writers/core/type-builder';
import { DtoWriter } from './writers/dto.writer';
import { IndexWriter } from './writers/index.writer';
import { ServiceWriter } from './writers/service.writer';

/**
 * Optional configuration for the Generator Engine.
 */
export interface GeneratorConfig {
  /**
   * The name of the main NestJS module to generate (default: 'ApiModule').
   */
  moduleName?: string;
  /**
   * If true, skips the final code formatting step (not implemented yet, but reserved).
   */
  skipFormatting?: boolean;
}

/**
 * Main Code Generation Engine.
 *
 * Orchestrates the entire generation process by delegating specific tasks to
 * specialized Writers (DTOs, Services, Modules, etc.) that emit code through
 * the TypeScript Compiler API (`ts.factory`) and format the result with Prettier.
 */
export class GeneratorEngine {
  private config: GeneratorConfig;

  private dtoWriter: DtoWriter;
  private serviceWriter: ServiceWriter;
  private apiTypesWriter: ApiTypesWriter;
  private apiConfigurationWriter: ApiConfigurationWriter;
  private apiUtilsWriter: ApiUtilsWriter;
  private apiModuleWriter: ApiModuleWriter;
  private indexWriter: IndexWriter;

  /**
   * Creates a new instance of the Generator Engine.
   *
   * @param outputDir - The absolute path where the generated files will be saved.
   * @param config - Optional configuration overrides.
   */
  constructor(
    private outputDir: string,
    config: GeneratorConfig = {},
  ) {
    this.config = {
      moduleName: 'ApiModule',
      skipFormatting: false,
      ...config,
    };

    const printer = new AstPrinter();
    const headerGen = new HeaderGenerator();
    const importBuilder = new ImportBuilder();
    const typeBuilder = new TypeBuilder();
    const declaratorBuilder = new DeclarationBuilder();
    const decoratorBuilder = new DecoratorBuilder();
    const commentModifier = new CommentModifier();
    const propertyBuilder = new PropertyBuilder(commentModifier);
    const expressionBuilder = new ExpressionBuilder();
    const parameterBuilder = new ParameterBuilder(commentModifier);
    const serviceMethodBuilder = new ServiceMethodBuilder(commentModifier);
    const serviceStatementBuilder = new ServiceStatementBuilder();

    this.dtoWriter = new DtoWriter(
      printer,
      headerGen,
      importBuilder,
      typeBuilder,
      declaratorBuilder,
      decoratorBuilder,
      propertyBuilder,
      commentModifier,
      expressionBuilder,
    );

    this.serviceWriter = new ServiceWriter(
      printer,
      headerGen,
      importBuilder,
      typeBuilder,
      decoratorBuilder,
      parameterBuilder,
      serviceMethodBuilder,
      serviceStatementBuilder,
    );

    this.apiTypesWriter = new ApiTypesWriter(
      printer,
      headerGen,
      importBuilder,
      typeBuilder,
      declaratorBuilder,
    );

    this.apiConfigurationWriter = new ApiConfigurationWriter(
      printer,
      headerGen,
      importBuilder,
      typeBuilder,
      decoratorBuilder,
    );

    this.apiUtilsWriter = new ApiUtilsWriter(printer, headerGen, importBuilder, typeBuilder);

    this.apiModuleWriter = new ApiModuleWriter(
      printer,
      headerGen,
      importBuilder,
      typeBuilder,
      decoratorBuilder,
    );

    this.indexWriter = new IndexWriter(printer, headerGen);
  }

  /**
   * Executes the code generation process based on the provided Internal Representation (IR).
   *
   * @param ir - The parsed and processed Internal Representation of the API.
   * @throws {Error} If any step of the generation process fails.
   */
  async generate(ir: IrDefinition): Promise<void> {
    Logger.info('Starting code generation...');

    try {
      const cliVersion = packageJson.version;
      const specTitle = ir.info?.title ?? 'Unknown Spec';
      const specVersion = ir.info?.version ?? 'Unknown Version';

      // 1. DTOs
      Logger.info(`Generating ${ir.models.length} DTOs...`);

      const dtoDir = path.join(this.outputDir, 'dto');
      mkdirSync(dtoDir, { recursive: true });

      for (const model of ir.models) {
        const file = await this.dtoWriter.write(
          model,
          ir.models,
          cliVersion,
          specTitle,
          specVersion,
        );
        writeFileSync(path.join(dtoDir, file.filename), file.generatedCode);
      }

      // 2. Services
      Logger.info(`Generating ${ir.services.length} Services...`);

      const serviceDir = path.join(this.outputDir, 'services');
      mkdirSync(serviceDir, { recursive: true });

      for (const service of ir.services) {
        const file = await this.serviceWriter.write(
          service,
          ir.models,
          cliVersion,
          specTitle,
          specVersion,
        );
        writeFileSync(path.join(serviceDir, file.filename), file.generatedCode);
      }

      // 3. NestJS module (api.types, api.configuration, api.utils, api.module)
      Logger.info('Generating NestJS Module...');

      const apiTypesFile = await this.apiTypesWriter.write(cliVersion, specTitle, specVersion);
      writeFileSync(path.join(this.outputDir, apiTypesFile.filename), apiTypesFile.generatedCode);

      const apiConfigFile = await this.apiConfigurationWriter.write(
        cliVersion,
        specTitle,
        specVersion,
      );
      writeFileSync(path.join(this.outputDir, apiConfigFile.filename), apiConfigFile.generatedCode);

      const apiUtilsFile = await this.apiUtilsWriter.write(cliVersion, specTitle, specVersion);
      writeFileSync(path.join(this.outputDir, apiUtilsFile.filename), apiUtilsFile.generatedCode);

      const moduleBaseName = this.config.moduleName?.replace(/Module$/, '') ?? 'Api';
      const apiModuleFile = await this.apiModuleWriter.write(
        ir.services,
        moduleBaseName,
        cliVersion,
        specTitle,
        specVersion,
      );
      writeFileSync(path.join(this.outputDir, apiModuleFile.filename), apiModuleFile.generatedCode);

      // 4. Barrel exports (index.ts)
      Logger.info('Generating barrel exports...');

      const dtoFileNames = ir.models.map(
        (model) => `${model.fileName}.${model.isEnum ? 'enum' : 'dto'}`,
      );
      const dtoIndex = await this.indexWriter.generate(
        dtoFileNames,
        cliVersion,
        specTitle,
        specVersion,
      );
      writeFileSync(path.join(dtoDir, 'index.ts'), dtoIndex.generatedCode);

      const serviceFileNames = ir.services.map(
        (service) => `${TypeHelper.getFileName(service.name)}.service`,
      );
      const serviceIndex = await this.indexWriter.generate(
        serviceFileNames,
        cliVersion,
        specTitle,
        specVersion,
      );
      writeFileSync(path.join(serviceDir, 'index.ts'), serviceIndex.generatedCode);

      const rootExports = [
        'dto',
        'services',
        'api.module',
        'api.configuration',
        'api.types',
        'api.utils',
      ];
      const rootIndex = await this.indexWriter.generate(
        rootExports,
        cliVersion,
        specTitle,
        specVersion,
      );
      writeFileSync(path.join(this.outputDir, 'index.ts'), rootIndex.generatedCode);

      Logger.info(`Code generation completed. Files written to: ${this.outputDir}`);
    } catch (error) {
      Logger.error('Code generation failed:', error);
      throw error;
    }
  }
}
