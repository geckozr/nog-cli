import { Project } from 'ts-morph';

import { version } from '../../../../package.json';
import { toCamelCase } from '../../../utils';
import { IrDefinition } from '../../ir/interfaces';
import { TypeHelper } from '../helpers/type.helper';
import { USAGE_TEMPLATE } from './usage.template';

/**
 * Generates a USAGE.md file with comprehensive usage documentation for the generated SDK.
 *
 * The generated documentation includes:
 * - API metadata (title, version, generation timestamp)
 * - Installation instructions
 * - Configuration examples
 * - Error handling patterns
 * - Complete list of available services from the OpenAPI specification
 *
 * This writer does not use ts-morph AST manipulation since it generates plain Markdown.
 */
export class UsageWriter {
  /**
   * Instantiates the usage documentation writer.
   *
   * @param project - The ts-morph Project instance (used only for file creation).
   * @param outputDir - The target directory where USAGE.md will be written.
   * @param specTitle - The OpenAPI specification title.
   * @param specVersion - The OpenAPI specification version.
   */
  constructor(
    private readonly project: Project,
    private readonly outputDir: string,
    private readonly specTitle: string = 'Unknown Spec',
    private readonly specVersion: string = 'Unknown Version',
  ) {}

  /**
   * Generates and writes the USAGE.md file based on the IR definition.
   *
   * @param ir - The Internal Representation containing services and metadata.
   */
  async write(ir: IrDefinition): Promise<void> {
    const content = this.replaceTemplateVars(USAGE_TEMPLATE, ir);
    const filePath = `${this.outputDir}/USAGE.md`;

    // Create the file using ts-morph Project (ensures proper path handling)
    this.project.createSourceFile(filePath, content, { overwrite: true });
  }

  /**
   * Replaces all template variables in the template string.
   *
   * @param template - The template content with {{PLACEHOLDER}} variables.
   * @param ir - The Internal Representation for context.
   * @returns The processed content with all placeholders replaced.
   */
  private replaceTemplateVars(template: string, ir: IrDefinition): string {
    const timestamp = new Date().toISOString();
    const servicesList = this.generateServicesList(ir);
    const firstService = ir.services[0];
    const firstServiceName = firstService?.name ?? 'AuthService';
    const firstServiceFileName = this.getServiceFileName(firstServiceName);

    const content = template
      .replace(/\{\{API_TITLE\}\}/g, this.specTitle)
      .replace(/\{\{API_VERSION\}\}/g, this.specVersion)
      .replace(/\{\{TIMESTAMP\}\}/g, timestamp)
      .replace(/\{\{NOGCLI_VERSION\}\}/g, version)
      .replace(/\{\{SERVICES_LIST\}\}/g, servicesList)
      .replace(/\{\{FIRST_SERVICE\}\}/g, firstServiceName)
      .replace(/\{\{FIRST_SERVICE_FILE\}\}/g, firstServiceFileName)
      .replace(/\{\{FIRST_SERVICE_CAMEL\}\}/g, toCamelCase(firstServiceName));

    return content;
  }

  /**
   * Generates the bulleted list of available services with descriptions.
   *
   * @param ir - The Internal Representation containing services.
   * @returns Markdown list of services.
   */
  private generateServicesList(ir: IrDefinition): string {
    if (ir.services.length === 0) {
      return '*(No services generated)*';
    }

    return ir.services
      .map((service) => {
        // Derive tag name from service name (e.g., 'AuthService' -> 'Auth')
        const tagName = service.name.replace(/Service$/, '');
        return `- \`${service.name}\` - ${tagName} operations`;
      })
      .join('\n');
  }

  /**
   * Converts a service class name to its corresponding filename.
   *
   * @param serviceName - The service class name (e.g., 'AuthService').
   * @returns The kebab-case filename without extension (e.g., 'auth.service').
   */
  private getServiceFileName(serviceName: string): string {
    return TypeHelper.getFileName(serviceName);
  }
}
