import { IndentationText, ModuleKind, Project, QuoteKind, ScriptTarget } from 'ts-morph';

import { Logger } from '../../utils/logger';
import { IrDefinition } from '../ir/interfaces';
import { DtoWriter } from './writers/dto.writer';
import { IndexWriter } from './writers/index.writer';
import { ModuleWriter } from './writers/module.writer';
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
 * It orchestrates the entire generation process by initializing the TypeScript project
 * and delegating specific tasks to specialized Writers (DTOs, Services, Modules, etc.).
 */
export class GeneratorEngine {
  private project: Project;
  private config: GeneratorConfig;

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

    // Initialize ts-morph Project with explicit compiler settings
    this.project = new Project({
      compilerOptions: {
        target: ScriptTarget.ESNext,
        module: ModuleKind.CommonJS,
        declaration: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      manipulationSettings: {
        indentationText: IndentationText.TwoSpaces,
        quoteKind: QuoteKind.Single,
        useTrailingCommas: true,
      },
    });
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
      const specTitle = ir.info?.title ?? 'Unknown Spec';
      const specVersion = ir.info?.version ?? 'Unknown Version';

      // 1. Generate DTOs
      Logger.info(`Generating ${ir.models.length} DTOs...`);
      const dtoWriter = new DtoWriter(
        this.project,
        this.outputDir,
        ir.models,
        specTitle,
        specVersion,
      );
      await dtoWriter.writeAll(ir.models);

      // 2. Generate Services
      Logger.info(`Generating ${ir.services.length} Services...`);
      const serviceWriter = new ServiceWriter(
        this.project,
        this.outputDir,
        ir.models,
        specTitle,
        specVersion,
      );
      await serviceWriter.writeAll(ir.services);

      // 3. Generate Module
      Logger.info('Generating NestJS Module...');
      const moduleWriter = new ModuleWriter(
        this.project,
        this.outputDir,
        this.config.moduleName,
        specTitle,
        specVersion,
      );
      await moduleWriter.write(ir);

      // 4. Generate Barrel Exports (index.ts)
      Logger.info('Generating barrel exports...');
      const indexWriter = new IndexWriter(this.project, this.outputDir, specTitle, specVersion);
      await indexWriter.write(ir);

      // 5. Save to Disk
      Logger.info('Writing files to disk...');
      await this.project.save();

      Logger.info(`✅ Code generation completed! Files written to: ${this.outputDir}`);
    } catch (error) {
      Logger.error('Code generation failed:', error);
      throw error;
    }
  }

  /**
   * Returns the underlying ts-morph Project instance.
   * Useful for testing or advanced manipulation.
   */
  getProject(): Project {
    return this.project;
  }
}
