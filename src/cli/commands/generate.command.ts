import { OpenAPIObject } from '@loopback/openapi-v3-types';

import { GeneratorEngine } from '../../core/generator';
import { OpenApiConverter } from '../../core/ir/openapi.converter';
import { OpenApiParser } from '../../core/parser/openapi.parser';
import { Logger } from '../../utils';
import { CommandConfig, CommandHandler } from '../types';

/**
 * Options for the generate command
 */
export interface GenerateOptions {
  output: string;
  moduleName: string;
}

/**
 * Configuration for the generate command
 */
const generateCommandConfig: Omit<CommandConfig<GenerateOptions>, 'action'> = {
  name: 'generate',
  description: 'Generate a NestJS client module from an OpenAPI file',
  arguments: [
    {
      name: '<openapiFile>',
      description: 'Path to the OpenAPI file (local path or HTTP/HTTPS URL)',
    },
  ],
  options: [
    {
      flags: '-o, --output <directory>',
      description: 'Output directory for the generated module',
      defaultValue: './output',
    },
    {
      flags: '-m, --module-name <name>',
      description: 'Name of the generated NestJS module',
      defaultValue: 'ApiModule',
    },
  ],
};

/**
 * Handler for the generate command
 */
export class GenerateCommand implements CommandHandler<GenerateOptions> {
  getConfig(): CommandConfig<GenerateOptions> {
    return {
      ...generateCommandConfig,
      action: this.execute.bind(this),
    };
  }

  /**
   * Execute the generate command
   */
  private async execute(args: string[], options: GenerateOptions): Promise<void> {
    const [openapiFile] = args;

    Logger.info('Generating NestJS client module with the following options:');
    Logger.info('  OpenAPI file:', openapiFile);
    Logger.info('  Output:', options.output);
    Logger.info('  Module name:', options.moduleName);

    // 1. Parse OpenAPI
    const openApi = await OpenApiParser.parse(openapiFile);

    Logger.info('Parsed OpenAPI document:', (openApi as OpenAPIObject).info.title);

    // 2. Convert to IR
    const converter = new OpenApiConverter(openApi);
    const ir = converter.convert();

    Logger.info(`Converted ${ir.models.length} models and ${ir.services.length} services`);

    // 3. Generate code
    const engine = new GeneratorEngine(options.output, {
      moduleName: options.moduleName,
    });
    await engine.generate(ir);

    Logger.info('✅ Generation completed successfully!');
  }
}
