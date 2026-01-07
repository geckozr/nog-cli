import { OpenAPIV3 } from 'openapi-types';

import {
  generateOperationId,
  isReservedWord,
  renameIfReserved,
  toCamelCase,
  toKebabCase,
  toPascalCase,
} from '../../utils';
import { Logger } from '../../utils/logger';
import { OpenApiDocument } from '../parser';
import { SchemaMerger } from './analyzer/schema.merger';
import { TypeMapper } from './analyzer/type.mapper';
import { IrDefinition, IrModel, IrParameter, IrProperty, IrService, IrType } from './interfaces';

/**
 * Core Converter Class.
 *
 * Transforms a raw OpenAPI AST (Abstract Syntax Tree) into the Internal Representation (IR).
 * This class handles the complexity of:
 * - resolving circular dependencies between models
 * - flattening inheritance structures (allOf)
 * - mapping OpenAPI types to TypeScript types
 * - organizing endpoints into logical services
 */
export class OpenApiConverter {
  /**
   * Registry to track created models using their original schema name as key.
   * Essential for resolving $ref pointers during the population phase.
   */
  private modelsRegistry = new Map<string, IrModel>();

  constructor(private readonly doc: OpenApiDocument) {}

  /**
   * Orchestrates the conversion process.
   * It uses a multi-pass approach to handle dependencies correctly.
   */
  public convert(): IrDefinition {
    Logger.info('Starting IR conversion...');

    // PASS 1: Discovery (Skeleton Creation)
    // Create empty model shells to allow circular references.
    this.initializeModels();

    // PASS 1.5: Sanitization
    // Rename models that conflict with reserved keywords.
    this.sanitizeModelNames();

    // PASS 2: Population (Detailed Analysis)
    // Fill models with properties, handling inheritance and relationships.
    this.populateModels();

    // PASS 3: Service Generation
    // Group operations into services and define methods.
    const services = this.buildServices();

    return {
      info: {
        title: this.doc.info?.title,
        version: this.doc.info?.version,
      },
      models: Array.from(this.modelsRegistry.values()),
      services: services,
    };
  }

  // ===========================================================================
  // PASS 1 & 1.5: Initialization & Sanitization
  // ===========================================================================

  private initializeModels(): void {
    if (!this.doc.components?.schemas) return;

    for (const [key, schema] of Object.entries(this.doc.components.schemas)) {
      const normalizedName = toPascalCase(key);
      const baseFileName = toKebabCase(key);

      // Safe cast to access description/enum, assuming SchemaObject structure
      const schemaObj = schema as OpenAPIV3.SchemaObject;

      this.modelsRegistry.set(key, {
        name: normalizedName,
        fileName: baseFileName,
        isEnum: !!schemaObj.enum, // Will be fully populated in Pass 2
        properties: [],
        description: schemaObj.description,
      });
    }
  }

  private sanitizeModelNames(): void {
    for (const [registryKey, irModel] of this.modelsRegistry.entries()) {
      if (isReservedWord(irModel.name)) {
        const renamedName = renameIfReserved(irModel.name);
        Logger.warn(
          `Model name '${irModel.name}' is a reserved word. Renaming to '${renamedName}' (schema key: ${registryKey}).`,
        );
        irModel.name = renamedName;
      }
    }
  }

  // ===========================================================================
  // PASS 2: Model Population
  // ===========================================================================

  private populateModels(): void {
    if (!this.doc.components?.schemas) return;

    for (const [key, schema] of Object.entries(this.doc.components.schemas)) {
      this.populateModel(key, schema as OpenAPIV3.SchemaObject);
    }
  }

  private populateModel(schemaKey: string, schema: OpenAPIV3.SchemaObject): void {
    const irModel = this.modelsRegistry.get(schemaKey);
    if (!irModel) return;

    // 1. Handle Enums
    if (schema.enum) {
      irModel.isEnum = true;
      irModel.enumValues = schema.enum.map(String);
      return;
    }

    // 2. Handle pure 'oneOf' schemas (Union Types/Polymorphism without shared props)
    if (schema.oneOf && schema.oneOf.length > 0 && !schema.properties) {
      this.handleOneOfModel(irModel, schema);
      return;
    }

    // 3. Handle 'allOf' (Inheritance/Composition)
    // We apply inheritance first to establish the 'extends' relationship
    if (schema.allOf) {
      const mergeResult = SchemaMerger.mergeAllOfSchemas(
        schema.allOf,
        this.modelsRegistry,
        schemaKey,
      );

      if (mergeResult.primaryRef) {
        irModel.extends = mergeResult.primaryRef;
      }

      // Add flattened properties from mixins
      for (const [propName, property] of mergeResult.properties) {
        // Direct properties take precedence over mixed-in properties
        if (!irModel.properties.find((p) => p.name === propName)) {
          irModel.properties.push(property);
        }
      }
    }

    // 4. Handle Direct Properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired = Array.isArray(schema.required) && schema.required.includes(propName);

        const property = this.createProperty(
          propName,
          propSchema as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
          isRequired,
        );

        // Avoid duplicates if allOf already added it (though direct props usually override)
        const existingIdx = irModel.properties.findIndex((p) => p.name === propName);
        if (existingIdx !== -1) {
          irModel.properties[existingIdx] = property;
        } else {
          irModel.properties.push(property);
        }
      }
    }
  }

  private handleOneOfModel(irModel: IrModel, schema: OpenAPIV3.SchemaObject): void {
    const oneOfRefs = this.extractOneOfReferences(schema.oneOf || []);
    const discriminatorConfig = TypeMapper.extractDiscriminatorFromSchema(schema, oneOfRefs);

    if (discriminatorConfig) {
      irModel.discriminator = discriminatorConfig.propertyName;
      irModel.subTypes = Object.entries(discriminatorConfig.mapping).map(([value, name]) => ({
        name,
        value,
      }));
    }
  }

  private createProperty(
    name: string,
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    required: boolean,
  ): IrProperty {
    const typeInfo = TypeMapper.map(schema, this.modelsRegistry);
    const schemaObj = schema as OpenAPIV3.SchemaObject;

    // Handle inline oneOf discriminator for specific properties
    let discriminator: IrProperty['discriminator'] = undefined;
    if (schemaObj.oneOf && schemaObj.oneOf.length > 0) {
      const oneOfRefs = this.extractOneOfReferences(schemaObj.oneOf);
      discriminator = TypeMapper.extractDiscriminatorFromSchema(schemaObj, oneOfRefs);
    }

    return {
      name,
      type: typeInfo,
      isOptional: !required,
      isReadonly: schemaObj.readOnly || false,
      description: schemaObj.description,
      validators: TypeMapper.extractValidators(schemaObj),
      discriminator,
    };
  }

  /**
   * Scansiona i path per creare i Servizi
   */
  private buildServices(): IrService[] {
    const servicesMap = new Map<string, IrService>();

    for (const [path, pathItem] of Object.entries(this.doc.paths || {})) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) continue;

        this.processOperation(path, method, operation, pathItem, servicesMap);
      }
    }

    return Array.from(servicesMap.values());
  }

  /**
   * Processes a single OpenAPI operation and registers it into the appropriate service.
   */
  private processOperation(
    path: string,
    method: string,
    op: OpenAPIV3.OperationObject,
    pathItem: OpenAPIV3.PathItemObject,
    servicesMap: Map<string, IrService>,
  ): void {
    // 1. Determine Service Name
    const tags = op.tags && op.tags.length > 0 ? op.tags : ['Default'];

    // We register the operation for EACH tag (duplication is standard in many generators if multiple tags exist)
    // or typically just the first one. Here we iterate all.
    tags.forEach((tag) => {
      const serviceName = `${toPascalCase(tag)}Service`;

      // Ensure service exists
      if (!servicesMap.has(serviceName)) {
        servicesMap.set(serviceName, { name: serviceName, operations: new Map() });
      }
      const service = servicesMap.get(serviceName)!;

      // 2. Resolve Success Response
      const successRes = this.extractSuccessResponse(op);
      if (!successRes) return; // Skip if no 2xx or default response

      const operationId = op.operationId || generateOperationId(method, path);
      const { parameters, requestContentType } = this.extractParameters(op, pathItem);

      // 3. Handle void/empty response
      if (!successRes.response.content || Object.keys(successRes.response.content).length === 0) {
        this.addOperationToService(service, {
          operationId,
          baseMethodName: toCamelCase(operationId),
          path,
          method,
          description: op.description,
          parameters,
          returnType: { rawType: 'void', isArray: false, isPrimitive: true },
          requestContentType,
        });
        return;
      }

      // 4. Handle content-negotiated responses
      // If an API returns JSON for one case and PDF for another, we generate separate methods.
      for (const [contentType, mediaType] of Object.entries(successRes.response.content)) {
        if (!mediaType.schema) continue;

        const label = this.extractContentTypeLabel(contentType);
        // e.g. getUserJson, getUserImage
        const baseMethodName = label
          ? `${toCamelCase(operationId)}_${label}`
          : toCamelCase(operationId);

        const returnType = this.extractReturnType(mediaType.schema);
        const acceptHeader = contentType;
        const responseType = this.determineResponseType(contentType);

        this.addOperationToService(service, {
          operationId,
          baseMethodName,
          path,
          method,
          description: op.description,
          parameters,
          returnType,
          requestContentType,
          acceptHeader,
          responseType,
        });
      }
    });
  }

  private addOperationToService(
    service: IrService,
    params: {
      operationId: string;
      baseMethodName: string;
      path: string;
      method: string;
      description?: string;
      parameters: IrParameter[];
      returnType: IrType;
      requestContentType?: string;
      acceptHeader?: string;
      responseType?: 'text' | 'blob' | 'arraybuffer';
    },
  ): void {
    const finalMethodName = this.resolveMethodNameCollision(
      service,
      params.baseMethodName,
      params.operationId,
    );

    // Unique key for the map to avoid overwriting overloads
    const operationKey = `${params.operationId}:${finalMethodName}`;

    service.operations.set(operationKey, {
      operationId: params.operationId,
      methodName: finalMethodName,
      path: params.path,
      method: params.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      description: params.description,
      parameters: params.parameters,
      returnType: params.returnType,
      requestContentType: params.requestContentType,
      acceptHeader: params.acceptHeader,
      responseType: params.responseType,
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private extractOneOfReferences(
    oneOf: (OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject)[],
  ): string[] {
    const refs: string[] = [];
    for (const item of oneOf) {
      if ('$ref' in item) {
        const refKey = item.$ref.split('/').pop() || '';
        const model = this.modelsRegistry.get(refKey);
        refs.push(model ? model.name : refKey);
      }
    }
    return refs;
  }

  private extractSuccessResponse(
    op: OpenAPIV3.OperationObject,
  ): { statusCode: string; response: OpenAPIV3.ResponseObject } | null {
    // Priority 1: 2xx range
    for (const statusCode of Object.keys(op.responses)) {
      if (statusCode.startsWith('2')) {
        return {
          statusCode,
          response: op.responses[statusCode] as OpenAPIV3.ResponseObject,
        };
      }
    }
    // Priority 2: default
    if (op.responses.default) {
      return {
        statusCode: 'default',
        response: op.responses.default as OpenAPIV3.ResponseObject,
      };
    }
    return null;
  }

  private resolveMethodNameCollision(
    service: IrService,
    baseMethodName: string,
    operationId: string,
  ): string {
    // If it doesn't exist, use it
    if (!this.serviceHasMethod(service, baseMethodName)) {
      return baseMethodName;
    }

    // Collision detected: append numeric suffix
    let counter = 2;
    let newMethodName = `${baseMethodName}_${counter}`;

    while (this.serviceHasMethod(service, newMethodName)) {
      counter++;
      newMethodName = `${baseMethodName}_${counter}`;
    }

    Logger.warn(
      `Operation collision in service '${service.name}' for opId '${operationId}': method '${baseMethodName}' exists. Renamed to '${newMethodName}'.`,
    );

    return newMethodName;
  }

  private serviceHasMethod(service: IrService, methodName: string): boolean {
    for (const op of service.operations.values()) {
      if (op.methodName === methodName) return true;
    }
    return false;
  }

  private extractContentTypeLabel(contentType: string): string {
    if (contentType === '*/*') return 'Any';

    const baseType = contentType.split(';')[0].trim();
    if (baseType === 'application/json') return '';

    const labelMap: Record<string, string> = {
      'application/xml': 'Xml',
      'application/x-xml': 'Xml',
      'text/xml': 'Xml',
      'application/octet-stream': 'Binary',
      'text/plain': 'Text',
      'text/html': 'Html',
    };

    if (labelMap[baseType]) return labelMap[baseType];

    if (baseType.startsWith('image/')) {
      // image/png -> ImagePng, image/* -> Image
      const subtype = baseType.split('/')[1];
      return subtype === '*' ? 'Image' : `Image${toPascalCase(subtype)}`;
    }

    // fallback: application/pdf -> Pdf
    const subtype = baseType.split('/')[1];
    return toPascalCase(subtype || 'Unknown');
  }

  private extractReturnType(schema?: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): IrType {
    if (!schema) {
      return { rawType: 'void', isArray: false, isPrimitive: true };
    }

    return TypeMapper.map(schema, this.modelsRegistry);
  }

  private extractParameters(
    operation: OpenAPIV3.OperationObject,
    pathItem: OpenAPIV3.PathItemObject,
  ): { parameters: IrParameter[]; requestContentType?: string } {
    const parameters: IrParameter[] = [];
    const allParams = [...(pathItem.parameters || []), ...(operation.parameters || [])];
    let requestContentType: string | undefined;

    for (const param of allParams) {
      let paramObj: OpenAPIV3.ParameterObject;

      // Resolve References
      if ('$ref' in param) {
        const resolved = this.resolveParameterRef(param.$ref);
        if (!resolved) {
          Logger.warn(`Cannot resolve parameter reference: ${param.$ref}`);
          continue;
        }
        paramObj = resolved;
      } else {
        paramObj = param as OpenAPIV3.ParameterObject;
      }

      parameters.push({
        name: paramObj.name,
        type: paramObj.schema
          ? TypeMapper.map(paramObj.schema, this.modelsRegistry)
          : { rawType: 'any', isArray: false, isPrimitive: true },
        in: paramObj.in as 'query' | 'path' | 'header',
        isRequired: paramObj.required || paramObj.in === 'path',
        description: paramObj.description,
      });
    }

    // Handle Request Body
    if (operation.requestBody) {
      requestContentType = this.extractRequestBody(operation.requestBody, parameters);
    }

    return { parameters, requestContentType };
  }

  private extractRequestBody(
    requestBody: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject,
    parameters: IrParameter[],
  ): string | undefined {
    if ('$ref' in requestBody) {
      // TODO: Resolve requestBody refs if strictly needed, usually body structure is inline or points to schema ref
      return undefined;
    }

    const bodyObj = requestBody as OpenAPIV3.RequestBodyObject;
    // Get first available content type
    const contentType = Object.keys(bodyObj.content)[0];
    const content = bodyObj.content[contentType];

    if (content?.schema) {
      // Pass context to TypeMapper so binary fields map to Buffer | ReadStream for multipart
      const bodyType = TypeMapper.map(content.schema, this.modelsRegistry, {
        isRequestBody: true,
        contentType,
      });
      parameters.push({
        name: 'body',
        type: bodyType,
        in: 'body',
        isRequired: bodyObj.required || false,
      });
    }

    return contentType;
  }

  private resolveParameterRef(ref: string): OpenAPIV3.ParameterObject | null {
    const paramName = ref.split('/').pop();
    if (!paramName) return null;

    const paramDef = this.doc.components?.parameters?.[paramName];
    if (!paramDef) return null;

    if ('$ref' in paramDef) {
      return this.resolveParameterRef(paramDef.$ref);
    }
    return paramDef as OpenAPIV3.ParameterObject;
  }

  /**
   * Determines the Axios responseType based on the content-type.
   */
  private determineResponseType(contentType: string): 'text' | 'blob' | 'arraybuffer' | undefined {
    if (contentType.startsWith('text/')) {
      return 'text';
    }
    if (
      contentType.startsWith('image/') ||
      contentType.startsWith('application/pdf') ||
      contentType.startsWith('application/octet-stream') ||
      contentType.includes('binary')
    ) {
      return 'arraybuffer';
    }
    // application/json and others default to undefined (JSON parsing)
    return undefined;
  }
}
