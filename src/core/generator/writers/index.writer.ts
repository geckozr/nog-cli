import { Project } from 'ts-morph';

import { IrDefinition } from '../../ir/interfaces';
import { FileHeaderHelper } from '../helpers/file-header.helper';
import { TypeHelper } from '../helpers/type.helper';

/**
 * Generates barrel export files (`index.ts`) for simplified SDK imports.
 *
 * Barrels reduce import path complexity for SDK consumers by re-exporting all models and services
 * from a single entry point per layer (DTOs, Services, root).
 *
 * Emitted files:
 * - `${outputDir}/dto/index.ts` – Re-exports all DTO and Enum definitions.
 * - `${outputDir}/services/index.ts` – Re-exports all Service classes.
 * - `${outputDir}/index.ts` – Re-exports DTO and Service barrels.
 *
 * Each barrel includes the standard generated file header with metadata.
 */
export class IndexWriter {
  /**
   * Instantiates the index writer.
   *
   * @param project - The ts-morph Project instance for AST manipulation.
   * @param outputDir - The target directory structure where barrels will be written.
   * @param specTitle - The OpenAPI specification title for file header metadata.
   * @param specVersion - The OpenAPI specification version for file header metadata.
   */
  constructor(
    private project: Project,
    private outputDir: string,
    private readonly specTitle: string = 'Unknown Spec',
    private readonly specVersion: string = 'Unknown Version',
  ) {}

  /**
   * Generates all necessary index.ts files for DTOs, services, and the root entrypoint.
   *
   * @param ir The Internal Representation containing models and services.
   * @returns Promise resolving when all barrel files are written.
   */
  async write(ir: IrDefinition): Promise<void> {
    // 1. DTOs Index
    await this.writeDtoIndex(ir);

    // 2. Services Index
    await this.writeServiceIndex(ir);

    // 3. Main Index
    await this.writeMainIndex();
  }

  /**
   * Generates the index file for DTOs and enums.
   *
   * @param ir The Internal Representation containing the models to export.
   * @returns Promise resolving when the DTO index is written.
   */
  private async writeDtoIndex(ir: IrDefinition): Promise<void> {
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/dto/index.ts`, '', {
      overwrite: true,
    });

    for (const model of ir.models) {
      const fileName = model.fileName;
      const extension = model.isEnum ? 'enum' : 'dto';

      sourceFile.addExportDeclaration({
        moduleSpecifier: `./${fileName}.${extension}`,
      });
    }

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  /**
   * Generates the index file for services.
   *
   * @param ir The Internal Representation containing the services to export.
   * @returns Promise resolving when the service index is written.
   */
  private async writeServiceIndex(ir: IrDefinition): Promise<void> {
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/services/index.ts`, '', {
      overwrite: true,
    });

    for (const service of ir.services) {
      // Reuse TypeHelper to ensure consistent naming conventions
      const fileName = TypeHelper.getFileName(service.name);

      sourceFile.addExportDeclaration({
        moduleSpecifier: `./${fileName}.service`,
      });
    }

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }

  /**
   * Generates the main entry point index file re-exporting DTO and service barrels,
   * plus the dynamic module, configuration, types, and utilities.
   *
   * @returns Promise resolving when the root index is written.
   */
  private async writeMainIndex(): Promise<void> {
    const sourceFile = this.project.createSourceFile(`${this.outputDir}/index.ts`, '', {
      overwrite: true,
    });

    // Re-export DTOs barrel
    sourceFile.addExportDeclaration({
      moduleSpecifier: './dto',
    });

    // Re-export Services barrel
    sourceFile.addExportDeclaration({
      moduleSpecifier: './services',
    });

    // Re-export Dynamic Module
    sourceFile.addExportDeclaration({
      moduleSpecifier: './api.module',
    });

    // Re-export Configuration Service
    sourceFile.addExportDeclaration({
      moduleSpecifier: './api.configuration',
    });

    // Re-export Types and Interfaces
    sourceFile.addExportDeclaration({
      moduleSpecifier: './api.types',
    });

    // Re-export Utilities
    sourceFile.addExportDeclaration({
      moduleSpecifier: './api.utils',
    });

    FileHeaderHelper.addHeader(sourceFile, this.specTitle, this.specVersion);
    sourceFile.formatText();
  }
}
