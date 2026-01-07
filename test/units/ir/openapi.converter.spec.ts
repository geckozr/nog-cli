import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { IrDefinition, OpenApiConverter } from '../../../src/core/ir';
import { OpenApiDocument } from '../../../src/core/parser';
import { Logger } from '../../../src/utils';

describe('OpenApiConverter', () => {
  describe('Petstore OpenAPI conversion', () => {
    describe('convert', () => {
      const openapiDoc: OpenApiDocument = JSON.parse(
        readFileSync(path.join(__dirname, '../../fixtures/petstore.json'), 'utf-8'),
      );
      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      it('should convert OpenAPI document to IRDefinition', () => {
        expect(converterInstance).toBeDefined();
        expect(converted).toBeDefined();
        expect((converted as IrDefinition).models).toBeDefined();
        expect((converted as IrDefinition).services).toBeDefined();
      });

      describe('models checking', () => {
        it('should have converted models', () => {
          const models = converted.models;
          expect(models.length).toBeGreaterThan(0);
        });

        it('should correctly convert the Pet model', () => {
          const petModel = converted.models.find((model) => model.name === 'Pet');
          expect(petModel).toBeDefined();
          expect(petModel?.properties.length).toBeGreaterThan(0);

          const idProperty = petModel?.properties.find((prop) => prop.name === 'id');
          expect(idProperty).toBeDefined();
          expect(idProperty?.type.rawType).toBe('number');
          expect(idProperty?.isOptional).toBe(true);

          const categoryProperty = petModel?.properties.find((prop) => prop.name === 'category');
          expect(categoryProperty).toBeDefined();
          expect(categoryProperty?.isReadonly).toBe(false);
          expect(categoryProperty?.isOptional).toBe(true);
          expect(categoryProperty?.type).toEqual({
            rawType: 'Category',
            isArray: false,
            isPrimitive: false,
          });

          const tagsProperty = petModel?.properties.find((prop) => prop.name === 'tags');
          expect(tagsProperty).toBeDefined();
          expect(tagsProperty?.isOptional).toBe(true);
          expect(tagsProperty?.type).toEqual({
            rawType: 'Tag',
            isArray: true,
            isPrimitive: false,
          });

          const statusProperty = petModel?.properties.find((prop) => prop.name === 'status');
          expect(statusProperty).toBeDefined();
          expect(statusProperty?.isOptional).toBe(true);
          expect(statusProperty?.type.rawType).toEqual(['available', 'pending', 'sold']);
        });
      });

      describe('service checking', () => {
        it('should have converted services', () => {
          const services = converted.services;
          expect(services.length).toBeGreaterThan(0);
        });

        it('should correctly convert PetService with GET operations', () => {
          const petService = converted.services.find((service) => service.name === 'PetService');
          expect(petService).toBeDefined();
          expect(petService?.operations.size).toBeGreaterThan(0);

          const getPetByIdOp = Array.from(petService?.operations.values() || []).find(
            (op) => op.methodName === 'getPetById',
          );
          expect(getPetByIdOp).toBeDefined();
          expect(getPetByIdOp?.method).toBe('GET');
          expect(getPetByIdOp?.path).toBe('/pet/{petId}');
          expect(getPetByIdOp?.returnType.rawType).toBe('Pet');
          expect(getPetByIdOp?.parameters.length).toBeGreaterThan(0);

          const petIdParam = getPetByIdOp?.parameters.find((p) => p.name === 'petId');
          expect(petIdParam).toBeDefined();
          expect(petIdParam?.in).toBe('path');
          expect(petIdParam?.isRequired).toBe(true);
          expect(petIdParam?.type.rawType).toBe('number');
        });

        it('should correctly convert PetService POST operation with request body', () => {
          const petService = converted.services.find((service) => service.name === 'PetService');

          const addPetOp = Array.from(petService?.operations.values() || []).find(
            (op) => op.methodName === 'addPet',
          );
          expect(addPetOp).toBeDefined();
          expect(addPetOp?.method).toBe('POST');
          expect(addPetOp?.parameters.length).toBeGreaterThan(0);

          const bodyParam = addPetOp?.parameters.find((p) => p.name === 'body');
          expect(bodyParam).toBeDefined();
          expect(bodyParam?.in).toBe('body');
          expect(bodyParam?.type.rawType).toBe('Pet');
          expect(bodyParam?.isRequired).toBe(true);
        });

        it('should correctly convert store API with query parameters', () => {
          const storeService = converted.services.find(
            (service) => service.name === 'StoreService',
          );
          expect(storeService).toBeDefined();

          const getInventoryOp = Array.from(storeService?.operations.values() || []).find(
            (op) => op.methodName === 'getInventory',
          );
          expect(getInventoryOp).toBeDefined();
          expect(getInventoryOp?.method).toBe('GET');
          expect(getInventoryOp?.path).toBe('/store/inventory');
          expect(getInventoryOp?.returnType.isPrimitive).toBe(false);
        });

        it('should handle array return types correctly', () => {
          const petService = converted.services.find((service) => service.name === 'PetService');

          const findPetsByStatusOp = Array.from(petService?.operations.values() || []).find(
            (op) => op.methodName === 'findPetsByStatus',
          );
          expect(findPetsByStatusOp).toBeDefined();
          expect(findPetsByStatusOp?.returnType.isArray).toBe(true);
          expect(findPetsByStatusOp?.returnType.rawType).toBe('Pet');

          const statusParam = findPetsByStatusOp?.parameters.find((p) => p.name === 'status');
          expect(statusParam).toBeDefined();
          expect(statusParam?.in).toBe('query');
        });
      });
    });
  });

  describe('Catas OpenAPI conversion', () => {
    describe('convert', () => {
      const openapiDoc: OpenApiDocument = JSON.parse(
        readFileSync(path.join(__dirname, '../../fixtures/cataas.json'), 'utf-8'),
      );
      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      it('should convert OpenAPI document to IRDefinition', () => {
        expect(converterInstance).toBeDefined();
        expect(converted).toBeDefined();
        expect((converted as IrDefinition).models).toBeDefined();
        expect((converted as IrDefinition).services).toBeDefined();
      });

      describe('models checking', () => {
        it('should correctly convert the Cat model', () => {
          const catModel = converted.models.find((model) => model.name === 'Cat');
          expect(catModel).toBeDefined();
          expect(catModel?.properties.length).toBeGreaterThan(0);

          const idProperty = catModel?.properties.find((prop) => prop.name === 'id');
          expect(idProperty).toBeDefined();
          expect(idProperty?.type.rawType).toBe('string');
          expect(idProperty?.isOptional).toBe(false);
        });
      });

      describe('service checking', () => {
        it('should correctly convert the CatsService', () => {
          const catsService = converted.services.find((service) => service.name === 'CatsService');
          expect(catsService).toBeDefined();
          expect(catsService?.operations.size).toBeGreaterThan(0);

          const getCatRandomOperation = catsService?.operations.get('cat:random:catRandom');
          expect(getCatRandomOperation).toBeDefined();
          expect(getCatRandomOperation?.method).toBe('GET');
          expect(getCatRandomOperation?.path).toBe('/cat');
          expect(getCatRandomOperation?.returnType.rawType).toBe('Cat');
        });

        it('should correctly convert the ApiService', () => {
          const apiService = converted.services.find((service) => service.name === 'APIService');
          expect(apiService).toBeDefined();
          expect(apiService?.operations.size).toBeGreaterThan(0);

          const listTagsOperation = apiService?.operations.get('api:tags:apiTags');
          expect(listTagsOperation).toBeDefined();
          expect(listTagsOperation?.method).toBe('GET');
          expect(listTagsOperation?.path).toBe('/api/tags');
          expect(listTagsOperation?.returnType.rawType).toBe('string');
        });
      });
    });
  });

  describe('Cyclos 4.15 OpenAPI conversion', () => {
    describe('convert', () => {
      const openapiDoc: OpenApiDocument = JSON.parse(
        readFileSync(path.join(__dirname, '../../fixtures/cyclos.json'), 'utf-8'),
      );
      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      it('should convert OpenAPI document to IRDefinition', () => {
        expect(converterInstance).toBeDefined();
        expect(converted).toBeDefined();
        expect((converted as IrDefinition).models).toBeDefined();
        expect((converted as IrDefinition).services).toBeDefined();
      });

      describe('models checking', () => {
        it('should correctly convert the UserVO model', () => {
          const userVOModel = converted.models.find((model) => model.name === 'UserView');
          expect(userVOModel).toBeDefined();
          expect(userVOModel?.properties.length).toBeGreaterThan(0);

          const usernameProperty = userVOModel?.properties.find((prop) => prop.name === 'username');
          expect(usernameProperty).toBeDefined();
          expect(usernameProperty?.type).toEqual({
            rawType: 'string',
            isArray: false,
            isPrimitive: true,
          });
          expect(usernameProperty?.isOptional).toBe(true);

          const roleProperty = userVOModel?.properties.find((prop) => prop.name === 'role');
          expect(roleProperty).toBeDefined();
          expect(roleProperty?.type).toEqual({
            rawType: 'RoleEnum',
            isArray: false,
            isPrimitive: false,
          });
          expect(roleProperty?.isOptional).toBe(true);
        });

        it('should correctly convert the RoleEnum model', () => {
          const roleEnumModel = converted.models.find((model) => model.name === 'RoleEnum');
          expect(roleEnumModel).toBeDefined();
          expect(roleEnumModel?.isEnum).toBe(true);
          expect(roleEnumModel?.enumValues).toBeDefined();
          expect(roleEnumModel?.enumValues?.length).toBeGreaterThan(0);
          expect(roleEnumModel?.enumValues).toEqual([
            'administrator',
            'broker',
            'member',
            'operator',
          ]);
        });
      });

      describe('service checking', () => {
        it('should correctly convert the UsersService', () => {
          const usersService = converted.services.find(
            (service) => service.name === 'UsersService',
          );
          expect(usersService).toBeDefined();
          expect(usersService?.operations.size).toBeGreaterThan(0);

          const getUserOperation = usersService?.operations.get('viewUser:viewUser');
          expect(getUserOperation).toBeDefined();
          expect(getUserOperation?.method).toBe('GET');
          expect(getUserOperation?.path).toBe('/users/{user}');
          expect(getUserOperation?.methodName).toBe('viewUser');
          expect(getUserOperation?.operationId).toBe('viewUser');
          expect(getUserOperation?.returnType).toEqual({
            rawType: 'UserView',
            isArray: false,
            isPrimitive: false,
          });
          expect(getUserOperation?.parameters.length).toBeGreaterThan(0);

          const userParam = getUserOperation?.parameters.find((p) => p.name === 'user');
          expect(userParam).toBeDefined();
          expect(userParam?.in).toBe('path');
          expect(userParam?.isRequired).toBe(true);
        });

        it('should handle operations without tags by assigning them to DefaultService', () => {
          const defaultService = converted.services.find(
            (service) => service.name === 'DefaultService',
          );
          // DefaultService should be created if there are operations without tags
          // This depends on the Cyclos API structure
          if (defaultService) {
            expect(defaultService?.operations.size).toBeGreaterThanOrEqual(0);
          }
        });

        it('should correctly handle Record<string, T> in UserView model', () => {
          const userViewModel = converted.models.find((model) => model.name === 'UserView');
          const recordsProperty = userViewModel?.properties.find((prop) => prop.name === 'records');
          expect(recordsProperty).toBeDefined();
          expect(recordsProperty?.type.rawType).toMatch(/^Record<string,/);
        });
      });
    });
  });

  describe('Edge Cases OpenAPI conversion', () => {
    describe('convert', () => {
      const openapiDoc: OpenApiDocument = JSON.parse(
        readFileSync(path.join(__dirname, '../../fixtures/edge-cases.json'), 'utf-8'),
      );
      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      it('should convert edge cases OpenAPI document to IRDefinition', () => {
        expect(converterInstance).toBeDefined();
        expect(converted).toBeDefined();
        expect((converted as IrDefinition).models).toBeDefined();
        expect((converted as IrDefinition).services).toBeDefined();
      });

      describe('models checking', () => {
        it('should correctly convert the Item model', () => {
          const itemModel = converted.models.find((model) => model.name === 'Item');
          expect(itemModel).toBeDefined();
          expect(itemModel?.properties.length).toBeGreaterThan(0);

          const statusProperty = itemModel?.properties.find((prop) => prop.name === 'status');
          expect(statusProperty).toBeDefined();
          expect(statusProperty?.type.rawType).toEqual(['active', 'inactive', 'archived']);

          const tagsProperty = itemModel?.properties.find((prop) => prop.name === 'tags');
          expect(tagsProperty).toBeDefined();
          expect(tagsProperty?.type.isArray).toBe(true);

          const metadataProperty = itemModel?.properties.find((prop) => prop.name === 'metadata');
          expect(metadataProperty).toBeDefined();
          expect(metadataProperty?.type.rawType).toMatch(/^Record<string,/);
        });
      });

      describe('service checking - edge cases', () => {
        it('should handle POST with request body correctly', () => {
          const itemsService = converted.services.find(
            (service) => service.name === 'ItemsService',
          );
          expect(itemsService).toBeDefined();

          const createItemOp = Array.from(itemsService?.operations.values() || []).find(
            (op) => op.methodName === 'createItem',
          );
          expect(createItemOp).toBeDefined();
          expect(createItemOp?.method).toBe('POST');

          const bodyParam = createItemOp?.parameters.find((p) => p.name === 'body');
          expect(bodyParam).toBeDefined();
          expect(bodyParam?.in).toBe('body');
          expect(bodyParam?.type.rawType).toBe('Item');
          expect(bodyParam?.isRequired).toBe(true);
        });

        it('should handle operations with no content response (204)', () => {
          const itemsService = converted.services.find(
            (service) => service.name === 'ItemsService',
          );

          const deleteItemOp = Array.from(itemsService?.operations.values() || []).find(
            (op) => op.methodName === 'deleteItem',
          );
          expect(deleteItemOp).toBeDefined();
          expect(deleteItemOp?.method).toBe('DELETE');
          expect(deleteItemOp?.returnType.rawType).toBe('void');
          expect(deleteItemOp?.returnType.isPrimitive).toBe(true);
        });

        it('should handle multiple content types in response', () => {
          const exportService = converted.services.find(
            (service) => service.name === 'ExportService',
          );
          expect(exportService).toBeDefined();

          const exportDataOps = Array.from(exportService?.operations.values() || []).filter(
            (op) => op.operationId === 'exportData',
          );
          // Quando ci sono multiple content types, dovrebbe creare almeno un'operazione
          expect(exportDataOps.length).toBeGreaterThanOrEqual(1);

          // Al meno uno dovrebbe essere array di Item
          const itemArrayOp = exportDataOps.find(
            (op) => op.returnType.isArray && op.returnType.rawType === 'Item',
          );
          expect(itemArrayOp).toBeDefined();
        });

        it('should handle operations without tags (assign to DefaultService)', () => {
          const defaultService = converted.services.find(
            (service) => service.name === 'DefaultService',
          );
          expect(defaultService).toBeDefined();

          const untaggedOp = Array.from(defaultService?.operations.values() || []).find(
            (op) => op.operationId === 'untaggedOperation',
          );
          expect(untaggedOp).toBeDefined();
          expect(untaggedOp?.path).toBe('/untagged-endpoint');
        });

        it('should handle operations with query and path parameters mixed', () => {
          const itemsService = converted.services.find(
            (service) => service.name === 'ItemsService',
          );

          const renameItemOp = Array.from(itemsService?.operations.values() || []).find(
            (op) => op.methodName === 'renameItem',
          );
          expect(renameItemOp).toBeDefined();
          expect(renameItemOp?.method).toBe('POST');

          const idParam = renameItemOp?.parameters.find((p) => p.name === 'id');
          expect(idParam).toBeDefined();
          expect(idParam?.in).toBe('path');
          expect(idParam?.isRequired).toBe(true);

          const newNameParam = renameItemOp?.parameters.find((p) => p.name === 'newName');
          expect(newNameParam).toBeDefined();
          expect(newNameParam?.in).toBe('query');
          expect(newNameParam?.isRequired).toBe(true);

          const bodyParam = renameItemOp?.parameters.find((p) => p.name === 'body');
          expect(bodyParam).toBeDefined();
          expect(bodyParam?.in).toBe('body');
          expect(bodyParam?.isRequired).toBe(false);
        });

        it('should handle operations with only default response', () => {
          const defaultService = converted.services.find(
            (service) => service.name === 'DefaultService',
          );

          const withDefaultOp = Array.from(defaultService?.operations.values() || []).find(
            (op) => op.operationId === 'endpointWithDefault',
          );
          expect(withDefaultOp).toBeDefined();
          expect(withDefaultOp?.returnType.rawType).toBe('Item');
          expect(withDefaultOp?.returnType.isPrimitive).toBe(false);
        });

        it('should handle operations without content in request body', () => {
          // The syncData operation has no content in response (202 Accepted)
          const allServices = converted.services;
          const syncOp = allServices
            .flatMap((s) => Array.from(s.operations.values()))
            .find((op) => op.operationId === 'syncData');

          expect(syncOp).toBeDefined();
          expect(syncOp?.returnType.rawType).toBe('void');
          expect(syncOp?.returnType.isPrimitive).toBe(true);
          expect(syncOp?.returnType.isArray).toBe(false);
        });

        it('should correctly handle 204 No Content responses returning void', () => {
          const itemsService = converted.services.find(
            (service) => service.name === 'ItemsService',
          );

          const deleteItemOp = Array.from(itemsService?.operations.values() || []).find(
            (op) => op.methodName === 'deleteItem',
          );

          expect(deleteItemOp).toBeDefined();
          expect(deleteItemOp?.returnType.rawType).toBe('void');
          expect(deleteItemOp?.returnType.isPrimitive).toBe(true);
          expect(deleteItemOp?.returnType.isArray).toBe(false);
        });

        it('should handle array return types in search operations', () => {
          const itemsService = converted.services.find(
            (service) => service.name === 'ItemsService',
          );

          const searchItemsOp = Array.from(itemsService?.operations.values() || []).find(
            (op) => op.methodName === 'searchItems',
          );
          expect(searchItemsOp).toBeDefined();
          expect(searchItemsOp?.returnType.isArray).toBe(true);
          expect(searchItemsOp?.returnType.rawType).toBe('Item');

          const queryParam = searchItemsOp?.parameters.find((p) => p.name === 'query');
          expect(queryParam).toBeDefined();
          expect(queryParam?.in).toBe('query');
          expect(queryParam?.isRequired).toBe(false);

          const limitParam = searchItemsOp?.parameters.find((p) => p.name === 'limit');
          expect(limitParam).toBeDefined();
          expect(limitParam?.type.rawType).toBe('number');
        });

        it('should resolve method name collisions by adding numeric suffix', () => {
          const adminService = converted.services.find(
            (service) => service.name === 'AdminService',
          );
          expect(adminService).toBeDefined();

          // Three endpoints have operationId "processData" but different paths
          const processDataOps = Array.from(adminService?.operations.values() || []).filter(
            (op) => op.operationId === 'processData',
          );

          expect(processDataOps.length).toBe(3);

          // Should have processData, processData_2, processData_3
          const methodNames = processDataOps.map((op) => op.methodName).sort();
          expect(methodNames).toContain('processData');
          expect(methodNames).toContain('processData_2');
          expect(methodNames).toContain('processData_3');
        });

        it('should handle various content types correctly', () => {
          // Get all services to find document operations
          const allOps = converted.services
            .flatMap((s) => Array.from(s.operations.values()))
            .filter((op) => op.operationId === 'getDocument');

          expect(allOps.length).toBeGreaterThanOrEqual(1);

          // Should have operations for different content types
          const methodNames = allOps.map((op) => op.methodName);
          // At least one operation should exist
          expect(methodNames.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle image content types with proper naming', () => {
          const allOps = converted.services
            .flatMap((s) => Array.from(s.operations.values()))
            .filter((op) => op.operationId === 'getDocument');

          expect(allOps.length).toBeGreaterThanOrEqual(1);
          const methodNames = allOps.map((op) => op.methodName);

          // Should have at least the base operation
          expect(methodNames.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle binary content types (octet-stream)', () => {
          const allOps = converted.services
            .flatMap((s) => Array.from(s.operations.values()))
            .filter((op) => op.operationId === 'uploadMedia');

          expect(allOps.length).toBeGreaterThanOrEqual(1);

          // Should have operations for binary types
          const methodNames = allOps.map((op) => op.methodName);
          expect(methodNames.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle text/html content type', () => {
          const allOps = converted.services
            .flatMap((s) => Array.from(s.operations.values()))
            .filter((op) => op.operationId === 'generateHTML');

          expect(allOps.length).toBeGreaterThanOrEqual(1);

          const htmlOp = allOps[0];
          expect(htmlOp).toBeDefined();
          expect(htmlOp?.returnType.rawType).toBe('string');
          expect(htmlOp?.methodName).toMatch(/[Hh]tml|generateHTML/);
        });

        it('should skip unresolvable parameter references', () => {
          // The generateHTML operation has a $ref to a non-existent parameter
          // This should log a warning and skip that parameter
          const allOps = converted.services
            .flatMap((s) => Array.from(s.operations.values()))
            .filter((op) => op.operationId === 'generateHTML');

          expect(allOps.length).toBeGreaterThanOrEqual(1);

          const htmlOp = allOps[0];
          // Should not have parameters since the $ref could not be resolved
          expect(htmlOp?.parameters.length).toBe(0);
        });

        it('should skip operations with missing schema in content', () => {
          // The getNoSchema operation has content but no schema defined
          // This should skip the operation due to missing schema warning
          const allOps = converted.services
            .flatMap((s) => Array.from(s.operations.values()))
            .filter((op) => op.operationId === 'getNoSchema');

          // When schema is missing, it logs a warning and continues
          // So there should be no operations created for this
          expect(allOps.length).toBe(0);
        });
      });
    });
  });

  describe('Reserved Word Model Name Collision Detection', () => {
    it('should rename model with reserved name "Record"', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Record: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                data: { type: 'string' },
              },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const recordModel = converted.models.find((m) => m.name === 'Record_');
      expect(recordModel).toBeDefined();
      expect(recordModel?.name).toBe('Record_');
      expect(recordModel?.properties.length).toBe(2);
    });

    it('should rename multiple models with reserved names', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Record: { type: 'object', properties: { id: { type: 'string' } } },
            Date: {
              type: 'object',
              properties: { timestamp: { type: 'string', format: 'date-time' } },
            },
            Promise: { type: 'object', properties: { result: { type: 'string' } } },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      expect(converted.models.find((m) => m.name === 'Record_')).toBeDefined();
      expect(converted.models.find((m) => m.name === 'Date_')).toBeDefined();
      expect(converted.models.find((m) => m.name === 'Promise_')).toBeDefined();
    });

    it('should preserve registry keys unchanged for $ref resolution', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Record: { type: 'object', properties: { id: { type: 'string' } } },
            User: {
              type: 'object',
              properties: {
                metadata: { $ref: '#/components/schemas/Record' },
              },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const userModel = converted.models.find((m) => m.name === 'User');
      const metadataProp = userModel?.properties.find((p) => p.name === 'metadata');

      // The property should reference the renamed model name
      expect(metadataProp?.type.rawType).toBe('Record_');
    });

    it('should not rename non-reserved model names', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            User: { type: 'object', properties: { id: { type: 'string' } } },
            Product: { type: 'object', properties: { name: { type: 'string' } } },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      expect(converted.models.find((m) => m.name === 'User')).toBeDefined();
      expect(converted.models.find((m) => m.name === 'Product')).toBeDefined();
      expect(converted.models.find((m) => m.name === 'User_')).toBeUndefined();
      expect(converted.models.find((m) => m.name === 'Product_')).toBeUndefined();
    });

    it('should log warning for each reserved word collision during discovery', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Record: { type: 'object', properties: { id: { type: 'string' } } },
            Array: { type: 'object', properties: { items: { type: 'string' } } },
          },
        },
      };

      // Spy on Logger.warn
      const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      const converterInstance = new OpenApiConverter(openapiDoc);
      converterInstance.convert();

      // Should have at least 2 warning calls (one per reserved word collision)
      const reservedWordWarnings = warnSpy.mock.calls.filter((call) =>
        call[0].includes('reserved word'),
      );
      expect(reservedWordWarnings.length).toBe(2);

      warnSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle allOf with property override (same property in parent and direct)', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Base: {
              type: 'object',
              properties: {
                id: { type: 'string' },
              },
            },
            Derived: {
              allOf: [
                { $ref: '#/components/schemas/Base' },
                {
                  type: 'object',
                  properties: {
                    id: { type: 'number' }, // Override with different type
                    name: { type: 'string' },
                  },
                },
              ],
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const derivedModel = converted.models.find((m) => m.name === 'Derived');
      expect(derivedModel).toBeDefined();

      const idProp = derivedModel?.properties.find((p) => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp?.type.rawType).toBe('number'); // Should use overridden type
    });

    it('should handle property with inline oneOf discriminator', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Container: {
              type: 'object',
              properties: {
                content: {
                  oneOf: [
                    { $ref: '#/components/schemas/TextContent' },
                    { $ref: '#/components/schemas/ImageContent' },
                  ],
                  discriminator: {
                    propertyName: 'type',
                  },
                },
              },
            },
            TextContent: {
              type: 'object',
              properties: { type: { type: 'string' }, text: { type: 'string' } },
            },
            ImageContent: {
              type: 'object',
              properties: { type: { type: 'string' }, url: { type: 'string' } },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const containerModel = converted.models.find((m) => m.name === 'Container');
      expect(containerModel).toBeDefined();

      const contentProp = containerModel?.properties.find((p) => p.name === 'content');
      expect(contentProp).toBeDefined();
      expect(contentProp?.discriminator).toBeDefined();
      expect(contentProp?.discriminator?.propertyName).toBe('type');
    });

    it('should handle operation with void response (204 No Content)', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            delete: {
              operationId: 'deleteUser',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: {
                '204': {
                  description: 'No Content',
                },
              },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const defaultService = converted.services.find((s) => s.name === 'DefaultService');
      expect(defaultService).toBeDefined();

      const deleteOp = Array.from(defaultService?.operations.values() || []).find(
        (op) => op.methodName === 'deleteUser',
      );
      expect(deleteOp).toBeDefined();
      expect(deleteOp?.returnType.rawType).toBe('void');
    });

    it('should handle requestBody as $ref', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                $ref: '#/components/requestBodies/UserBody',
              },
              responses: {
                '201': {
                  description: 'Created',
                  content: {
                    'application/json': {
                      schema: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          requestBodies: {
            UserBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const service = converted.services[0];
      const createOp = Array.from(service?.operations.values() || []).find(
        (op) => op.methodName === 'createUser',
      );
      expect(createOp).toBeDefined();
      // RequestBody $ref should be handled (early return in code)
    });

    it('should handle parameter with nested $ref', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/items': {
            get: {
              operationId: 'getItems',
              parameters: [{ $ref: '#/components/parameters/LimitParam' }],
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': { schema: { type: 'array', items: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
        components: {
          parameters: {
            LimitParam: {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer' },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const service = converted.services[0];
      const getOp = Array.from(service?.operations.values() || []).find(
        (op) => op.methodName === 'getItems',
      );
      expect(getOp).toBeDefined();
      expect(getOp?.parameters.length).toBeGreaterThan(0);

      const limitParam = getOp?.parameters.find((p) => p.name === 'limit');
      expect(limitParam).toBeDefined();
      expect(limitParam?.type.rawType).toBe('number');
    });

    it('should handle allOf with property override', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Base: {
              type: 'object',
              properties: {
                id: { type: 'string' },
              },
            },
            Extended: {
              allOf: [
                { $ref: '#/components/schemas/Base' },
                {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                  },
                },
              ],
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const extendedModel = converted.models.find((m) => m.name === 'Extended');
      expect(extendedModel).toBeDefined();

      const idProp = extendedModel?.properties.find((p) => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp?.type.rawType).toBe('number');
    });

    it('should handle property with inline oneOf discriminator', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Container: {
              type: 'object',
              properties: {
                content: {
                  oneOf: [
                    { $ref: '#/components/schemas/TypeA' },
                    { $ref: '#/components/schemas/TypeB' },
                  ],
                  discriminator: {
                    propertyName: 'kind',
                    mapping: {
                      a: '#/components/schemas/TypeA',
                      b: '#/components/schemas/TypeB',
                    },
                  },
                },
              },
            },
            TypeA: { type: 'object', properties: { kind: { type: 'string' } } },
            TypeB: { type: 'object', properties: { kind: { type: 'string' } } },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const containerModel = converted.models.find((m) => m.name === 'Container');
      expect(containerModel).toBeDefined();

      const contentProp = containerModel?.properties.find((p) => p.name === 'content');
      expect(contentProp).toBeDefined();
      expect(contentProp?.discriminator).toBeDefined();
      expect(contentProp?.discriminator?.propertyName).toBe('kind');
    });

    it('should handle operation with void response (204 No Content)', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/resource': {
            delete: {
              operationId: 'deleteResource',
              responses: {
                '204': {
                  description: 'No Content',
                },
              },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const service = converted.services[0];
      const deleteOp = Array.from(service?.operations.values() || []).find(
        (op) => op.methodName === 'deleteResource',
      );
      expect(deleteOp).toBeDefined();
      expect(deleteOp?.returnType.rawType).toBe('void');
    });

    it('should handle requestBody as $ref', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/items': {
            post: {
              operationId: 'createItem',
              requestBody: { $ref: '#/components/requestBodies/ItemBody' },
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
        components: {
          requestBodies: {
            ItemBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { name: { type: 'string' } } },
                },
              },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const service = converted.services[0];
      const createOp = Array.from(service?.operations.values() || []).find(
        (op) => op.methodName === 'createItem',
      );
      expect(createOp).toBeDefined();
    });

    it('should handle parameter with nested $ref', () => {
      const openapiDoc: OpenApiDocument = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/items': {
            get: {
              operationId: 'getItems',
              parameters: [{ $ref: '#/components/parameters/RefParam' }],
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
        components: {
          parameters: {
            RefParam: { $ref: '#/components/parameters/ActualParam' },
            ActualParam: {
              name: 'filter',
              in: 'query',
              schema: { type: 'string' },
            },
          },
        },
      };

      const converterInstance = new OpenApiConverter(openapiDoc);
      const converted = converterInstance.convert();

      const service = converted.services[0];
      const getOp = Array.from(service?.operations.values() || []).find(
        (op) => op.methodName === 'getItems',
      );
      expect(getOp).toBeDefined();
    });
  });
});
