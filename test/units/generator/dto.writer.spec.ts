import { ClassDeclaration, Project } from 'ts-morph';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DtoWriter } from '../../../src/core/generator/';
import { IrModel } from '../../../src/core/ir/interfaces';

describe('DtoWriter', () => {
  let project: Project;
  let dtoWriter: DtoWriter;

  beforeAll(() => {
    project = new Project();
    dtoWriter = new DtoWriter(project, 'test-output/test-dto', []);
  });

  describe('writeAll', () => {
    beforeAll(async () => {
      const models: IrModel[] = [
        // 1. Standard DTO
        {
          name: 'UserDto',
          fileName: 'user-dto',
          isEnum: false,
          properties: [
            {
              name: 'email',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              description: 'User email',
              validators: [{ type: 'IS_EMAIL' }],
            },
            {
              name: 'password',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              description: 'User password',
              validators: [],
            },
            {
              name: 'imageUrl',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: true,
              isReadonly: false,
              description: 'Profile image URL',
              validators: [],
            },
            {
              name: 'categories',
              type: { rawType: 'UserCategoriesDto', isArray: true, isPrimitive: false },
              isOptional: true,
              isReadonly: false,
              description: 'User categories',
              validators: [],
            },
            {
              name: 'age',
              type: { rawType: 'number', isArray: false, isPrimitive: true },
              isOptional: true,
              isReadonly: false,
              description: 'User age',
              validators: [{ type: 'MIN', params: 0 }],
            },
            {
              name: 'premiumMember',
              type: { rawType: 'boolean', isArray: false, isPrimitive: true },
              isOptional: true,
              isReadonly: false,
              description: 'Is premium member',
              validators: [],
            },
            {
              name: 'createdAt',
              type: { rawType: 'Date', isArray: false, isPrimitive: false },
              isOptional: false,
              isReadonly: false,
              description: 'Creation date',
              validators: [{ type: 'IS_DATE' }],
            },
            {
              name: 'website',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: true,
              isReadonly: false,
              description: 'Website',
              validators: [{ type: 'IS_URL' }],
            },
          ],
          description: 'User DTO',
        },
        // 2. Enum
        {
          name: 'StatusEnum',
          fileName: 'status-enum',
          isEnum: true,
          properties: [],
          enumValues: ['ACTIVE', 'INACTIVE', 'PENDING'],
          description: 'Status Enum',
        },
        // 3. Empty DTO
        {
          name: 'EmptyDto',
          fileName: 'empty-dto',
          isEnum: false,
          properties: [],
          description: 'An empty DTO',
        },
        // 4. PetDto (Union of Literals)
        {
          name: 'PetDto',
          fileName: 'pet-dto',
          isEnum: false,
          description: 'Base pet',
          discriminator: { propertyName: 'type', mapping: {} } as any,
          subTypes: [
            { name: 'CatDto', value: 'cat' } as any,
            { name: 'DogDto', value: 'dog' } as any,
          ],
          properties: [
            {
              name: 'status',
              type: {
                rawType: ['available', 'pending', 'sold'],
                isArray: false,
                isPrimitive: true,
                composition: 'union',
              },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        // 5. Helper DTOs
        {
          name: 'BaseProfileDto',
          fileName: 'base-profile-dto',
          isEnum: false,
          properties: [
            {
              name: 'id',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        {
          name: 'AuditFieldsDto',
          fileName: 'audit-fields-dto',
          isEnum: false,
          properties: [
            {
              name: 'createdAt',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        {
          name: 'IndoorTraitsDto',
          fileName: 'indoor-traits-dto',
          isEnum: false,
          properties: [
            {
              name: 'indoor',
              type: { rawType: 'boolean', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        {
          name: 'OutdoorTraitsDto',
          fileName: 'outdoor-traits-dto',
          isEnum: false,
          properties: [
            {
              name: 'outdoor',
              type: { rawType: 'boolean', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        {
          name: 'CatPackDto',
          fileName: 'cat-pack-dto',
          isEnum: false,
          properties: [
            {
              name: 'name',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        {
          name: 'DogPackDto',
          fileName: 'dog-pack-dto',
          isEnum: false,
          properties: [
            {
              name: 'name',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        // 6. CatDto (Inheritance, Union, Intersection)
        {
          name: 'CatDto',
          fileName: 'cat-dto',
          isEnum: false,
          extends: 'PetDto',
          properties: [
            {
              name: 'traits',
              type: {
                rawType: ['IndoorTraitsDto', 'OutdoorTraitsDto'],
                isArray: false,
                isPrimitive: false,
                composition: 'union',
              },
              isOptional: true,
              isReadonly: false,
              validators: [],
            },
            {
              name: 'profile',
              type: {
                rawType: ['BaseProfileDto', 'AuditFieldsDto'],
                isArray: false,
                isPrimitive: false,
                composition: 'intersection',
              },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
            {
              name: 'packs',
              type: {
                rawType: ['CatPackDto', 'DogPackDto'],
                isArray: true,
                isPrimitive: false,
                composition: 'union',
              },
              isOptional: true,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        // 7. Pure OneOf Model
        {
          name: 'MediaUnion',
          fileName: 'media-union',
          isEnum: false,
          properties: [], // No properties = Pure OneOf candidate (if subTypes present)
          discriminator: { propertyName: 'type', mapping: {} } as any,
          subTypes: [
            { name: 'ImageDto', value: 'image' } as any,
            { name: 'VideoDto', value: 'video' } as any,
          ],
          description: 'A pure union type',
        },
        // 8. DTO with Polymorphic Property
        {
          name: 'PageDto',
          fileName: 'page-dto',
          isEnum: false,
          properties: [
            {
              name: 'content',
              type: { rawType: 'BaseContentDto', isArray: true, isPrimitive: false },
              isOptional: false,
              isReadonly: false,
              validators: [],
              discriminator: {
                propertyName: 'kind',
                mapping: {
                  text: 'TextContentDto',
                  image: 'ImageContentDto',
                },
              },
            },
          ],
        },
        // 9. Dirty Enum values for sanitization
        {
          name: 'DirtyEnum',
          fileName: 'dirty-enum',
          isEnum: true,
          properties: [],
          enumValues: ['nasty value!', '123-start', 'mixed_CASE'],
          description: 'Enum with messy members',
        },
        // 10. Hybrid OneOf (should stay class)
        {
          name: 'HybridOneOf',
          fileName: 'hybrid-oneof',
          isEnum: false,
          discriminator: { propertyName: 'kind', mapping: {} } as any,
          subTypes: [
            { name: 'CatDto', value: 'cat' } as any,
            { name: 'DogDto', value: 'dog' } as any,
          ],
          properties: [
            {
              name: 'id',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        // 11. Undocumented Enum
        {
          name: 'UndocumentedEnum',
          fileName: 'undocumented-enum',
          isEnum: true,
          properties: [],
          enumValues: ['ALPHA', 'BETA'],
        },
        // 12. DTO with primitive arrays
        {
          name: 'ArrayDto',
          fileName: 'array-dto',
          isEnum: false,
          properties: [
            {
              name: 'scores',
              type: { rawType: 'number', isArray: true, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
            {
              name: 'tags',
              type: { rawType: 'string', isArray: true, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
            {
              name: 'flags',
              type: { rawType: 'boolean', isArray: true, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
        // 13. Pure OneOf with unregistered subType
        {
          name: 'ExternalUnion',
          fileName: 'external-union',
          isEnum: false,
          properties: [],
          discriminator: { propertyName: 'kind', mapping: {} } as any,
          subTypes: [
            { name: 'ExternalType', value: 'external' } as any,
            { name: 'CatDto', value: 'cat' } as any,
          ],
          description: 'Union with external reference',
        },
        // 14. DTO with polymorphic array
        {
          name: 'PolymorphicArrayDto',
          fileName: 'polymorphic-array-dto',
          isEnum: false,
          properties: [
            {
              name: 'items',
              type: { rawType: 'BaseItemDto', isArray: true, isPrimitive: false },
              isOptional: false,
              isReadonly: false,
              validators: [],
              discriminator: {
                propertyName: 'itemType',
                mapping: {
                  widget: 'WidgetDto',
                  gadget: 'GadgetDto',
                },
              },
            },
          ],
        },
        // 15. DTO with scalar properties
        {
          name: 'ScalarDto',
          fileName: 'scalar-dto',
          isEnum: false,
          properties: [
            {
              name: 'count',
              type: { rawType: 'number', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
            {
              name: 'active',
              type: { rawType: 'boolean', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
            {
              name: 'label',
              type: { rawType: 'string', isArray: false, isPrimitive: true },
              isOptional: false,
              isReadonly: false,
              validators: [],
            },
          ],
        },
      ];

      await dtoWriter.writeAll(models);
    });

    describe('UserDto', () => {
      let userDtoClass: ClassDeclaration;

      beforeEach(() => {
        const userDtoFile = project.getSourceFile('test-output/test-dto/dto/user-dto.dto.ts');
        userDtoClass = userDtoFile!.getClassOrThrow('UserDto');
      });

      it('should create UserDto file with correct class', () => {
        expect(userDtoClass).toBeDefined();
      });

      it('should add email property with validators', () => {
        const emailProp = userDtoClass!.getProperty('email');
        expect(emailProp).toBeDefined();
        expect(emailProp?.getType().getText()).toBe('string');
        expect(emailProp?.hasQuestionToken()).toBe(false);
        expect(emailProp?.getJsDocs()[0].getInnerText()).toBe('User email');
        const decorators = emailProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('IsNotEmpty');
        expect(decorators).toContain('IsString');
        expect(decorators).toContain('IsEmail');
      });

      it('should add optional array property (categories)', () => {
        const categoriesProp = userDtoClass!.getProperty('categories');
        expect(categoriesProp).toBeDefined();
        expect(categoriesProp?.getType().getText()).toBe('UserCategoriesDto[]');
        expect(categoriesProp?.getType().isArray()).toBe(true);
        const decorators = categoriesProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('IsOptional');
        expect(decorators).toContain('IsArray');
      });

      it('should add date-time property with Type and IsDate', () => {
        const createdAtProp = userDtoClass!.getProperty('createdAt');
        expect(createdAtProp).toBeDefined();
        expect(createdAtProp?.getType().getText()).toBe('Date');
        const decorators = createdAtProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('Type');
        expect(decorators).toContain('IsDate');

        // Verify Type argument
        const typeDecorator = createdAtProp?.getDecorator('Type');
        expect(typeDecorator?.getArguments()[0].getText()).toBe('() => Date');
      });
    });

    describe('PetDto - Union of Literals', () => {
      it('should handle inline union types (oneOf)', () => {
        const petDtoFile = project.getSourceFile('test-output/test-dto/dto/pet-dto.dto.ts');
        const petDtoClass = petDtoFile?.getClassOrThrow('PetDto');
        const statusProp = petDtoClass!.getProperty('status');

        expect(statusProp).toBeDefined();
        expect(statusProp?.getType().getText()).toBe('"available" | "pending" | "sold"');
      });

      it('should add IsIn decorator for union literals', () => {
        const petDtoFile = project.getSourceFile('test-output/test-dto/dto/pet-dto.dto.ts');
        const petDtoClass = petDtoFile?.getClassOrThrow('PetDto');
        const statusProp = petDtoClass!.getProperty('status');

        const isInDecorator = statusProp?.getDecorator('IsIn');
        expect(isInDecorator).toBeDefined();
        expect(isInDecorator?.getText()).toBe("@IsIn(['available', 'pending', 'sold'])");
      });
    });

    describe('MediaUnion - Pure OneOf', () => {
      it('should generate Type Alias instead of Class', () => {
        const mediaFile = project.getSourceFile('test-output/test-dto/dto/media-union.dto.ts');
        expect(mediaFile).toBeDefined();

        // Should NOT have a class
        const classDecl = mediaFile?.getClass('MediaUnion');
        expect(classDecl).toBeUndefined();

        // Should have a Type Alias
        const typeAlias = mediaFile?.getTypeAliasOrThrow('MediaUnion');
        expect(typeAlias).toBeDefined();
        expect(typeAlias!.isExported()).toBe(true);
        expect(typeAlias!.getTypeNode()?.getText()).toBe('ImageDto | VideoDto');
      });

      it('should import subTypes', () => {
        const mediaFile = project.getSourceFile('test-output/test-dto/dto/media-union.dto.ts');
        const imports = mediaFile?.getImportDeclarations();

        const importedModules = imports?.map((i) => i.getModuleSpecifierValue());
        expect(importedModules).toContain('./image-dto.dto');
        expect(importedModules).toContain('./video-dto.dto');
      });
    });

    describe('PageDto - Polymorphic Property', () => {
      it('should add ValidateNested and Type decorator with discriminator config', () => {
        const pageFile = project.getSourceFile('test-output/test-dto/dto/page-dto.dto.ts');
        const pageClass = pageFile?.getClassOrThrow('PageDto');
        const contentProp = pageClass!.getProperty('content');

        expect(contentProp).toBeDefined();

        // Check ValidateNested
        const validateNested = contentProp?.getDecorator('ValidateNested');
        expect(validateNested).toBeDefined();

        // Check Type decorator
        const typeDecorator = contentProp?.getDecorator('Type');
        expect(typeDecorator).toBeDefined();

        const args = typeDecorator?.getArguments();
        expect(args).toHaveLength(2);

        // Base type check
        expect(args![0].getText()).toBe('() => BaseContentDto');

        // Discriminator config check
        const configText = args![1].getText();
        expect(configText).toContain('keepDiscriminatorProperty: true');
        expect(configText).toContain("property: 'kind'");
        expect(configText).toContain("value: TextContentDto, name: 'text'");
        expect(configText).toContain("value: ImageContentDto, name: 'image'");
      });
    });

    describe('DirtyEnum - member sanitization', () => {
      it('should sanitize enum member names', () => {
        const enumFile = project.getSourceFile('test-output/test-dto/dto/dirty-enum.enum.ts');
        const enumDecl = enumFile?.getEnumOrThrow('DirtyEnum');
        const memberNames = enumDecl?.getMembers().map((m) => m.getName().replace(/"/g, ''));

        expect(memberNames).toEqual(['NASTY_VALUE', '123_START', 'MIXED_CASE']);
      });
    });

    describe('HybridOneOf - not treated as pure union', () => {
      it('should keep hybrid OneOf as class', () => {
        const hybridFile = project.getSourceFile('test-output/test-dto/dto/hybrid-oneof.dto.ts');
        const hybridClass = hybridFile?.getClass('HybridOneOf');
        const typeAlias = hybridFile?.getTypeAlias('HybridOneOf');

        expect(hybridClass).toBeDefined();
        expect(typeAlias).toBeUndefined();

        const idProp = hybridClass?.getProperty('id');
        expect(idProp?.getType().getText()).toBe('string');
      });
    });

    describe('UndocumentedEnum - no description', () => {
      it('should generate Enum without JSDoc when description is missing', () => {
        const enumFile = project.getSourceFile(
          'test-output/test-dto/dto/undocumented-enum.enum.ts',
        );
        const enumDecl = enumFile?.getEnumOrThrow('UndocumentedEnum');

        const docs = enumDecl?.getJsDocs();
        expect(docs).toEqual([]);
      });
    });

    describe('ArrayDto - primitive arrays', () => {
      it('should add IsArray but NOT IsNumber for number[] property', () => {
        const arrayFile = project.getSourceFile('test-output/test-dto/dto/array-dto.dto.ts');
        const arrayClass = arrayFile?.getClassOrThrow('ArrayDto');
        const scoresProp = arrayClass?.getProperty('scores');

        expect(scoresProp).toBeDefined();
        expect(scoresProp?.getType().getText()).toBe('number[]');

        const decorators = scoresProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('IsArray');
        expect(decorators).not.toContain('IsNumber');
      });

      it('should add IsArray but NOT IsString for string[] property', () => {
        const arrayFile = project.getSourceFile('test-output/test-dto/dto/array-dto.dto.ts');
        const arrayClass = arrayFile?.getClassOrThrow('ArrayDto');
        const tagsProp = arrayClass?.getProperty('tags');

        expect(tagsProp).toBeDefined();
        expect(tagsProp?.getType().getText()).toBe('string[]');

        const decorators = tagsProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('IsArray');
        expect(decorators).not.toContain('IsString');
      });

      it('should add IsArray but NOT IsBoolean for boolean[] property', () => {
        const arrayFile = project.getSourceFile('test-output/test-dto/dto/array-dto.dto.ts');
        const arrayClass = arrayFile?.getClassOrThrow('ArrayDto');
        const flagsProp = arrayClass?.getProperty('flags');

        expect(flagsProp).toBeDefined();
        expect(flagsProp?.getType().getText()).toBe('boolean[]');

        const decorators = flagsProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('IsArray');
        expect(decorators).not.toContain('IsBoolean');
      });
    });

    describe('ExternalUnion - unregistered subTypes', () => {
      it('should use kebab-case fallback for unregistered subTypes', () => {
        const unionFile = project.getSourceFile('test-output/test-dto/dto/external-union.dto.ts');
        const imports = unionFile?.getImportDeclarations();

        const importPaths = imports?.map((i) => i.getModuleSpecifierValue());
        expect(importPaths).toContain('./external-type.dto');
        expect(importPaths).toContain('./cat-dto.dto');
      });
    });

    describe('PolymorphicArrayDto - discriminator with array', () => {
      it('should add { each: true } to ValidateNested for polymorphic arrays', () => {
        const polyFile = project.getSourceFile(
          'test-output/test-dto/dto/polymorphic-array-dto.dto.ts',
        );
        const polyClass = polyFile?.getClassOrThrow('PolymorphicArrayDto');
        const itemsProp = polyClass?.getProperty('items');

        expect(itemsProp).toBeDefined();

        const validateNested = itemsProp?.getDecorator('ValidateNested');
        expect(validateNested).toBeDefined();
        expect(validateNested?.getText()).toContain('{ each: true }');
      });
    });

    describe('ScalarDto - non-array primitives', () => {
      it('should add IsNumber for number property', () => {
        const scalarFile = project.getSourceFile('test-output/test-dto/dto/scalar-dto.dto.ts');
        const scalarClass = scalarFile?.getClassOrThrow('ScalarDto');
        const countProp = scalarClass?.getProperty('count');

        expect(countProp).toBeDefined();
        expect(countProp?.getType().getText()).toBe('number');

        const decorators = countProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('IsNumber');
        expect(decorators).not.toContain('IsArray');
      });

      it('should add IsBoolean for boolean property', () => {
        const scalarFile = project.getSourceFile('test-output/test-dto/dto/scalar-dto.dto.ts');
        const scalarClass = scalarFile?.getClassOrThrow('ScalarDto');
        const activeProp = scalarClass?.getProperty('active');

        expect(activeProp).toBeDefined();
        expect(activeProp?.getType().getText()).toBe('boolean');

        const decorators = activeProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('IsBoolean');
        expect(decorators).not.toContain('IsArray');
      });

      it('should add IsString for string property', () => {
        const scalarFile = project.getSourceFile('test-output/test-dto/dto/scalar-dto.dto.ts');
        const scalarClass = scalarFile?.getClassOrThrow('ScalarDto');
        const labelProp = scalarClass?.getProperty('label');

        expect(labelProp).toBeDefined();
        expect(labelProp?.getType().getText()).toBe('string');

        const decorators = labelProp?.getDecorators().map((d) => d.getName());
        expect(decorators).toContain('IsString');
        expect(decorators).not.toContain('IsArray');
      });
    });

    describe('Edge Cases', () => {
      beforeAll(async () => {
        const edgeCaseModels: IrModel[] = [
          // Pure OneOf with empty subTypes
          {
            name: 'EmptyOneOf',
            fileName: 'empty-oneof',
            isEnum: false,
            properties: [],
            discriminator: { propertyName: 'type', mapping: {} } as any,
            subTypes: [],
          },
          // DTO with discriminator property (string rawType)
          {
            name: 'StringDiscriminatorDto',
            fileName: 'string-discriminator-dto',
            isEnum: false,
            properties: [
              {
                name: 'resource',
                type: { rawType: 'BaseResource', isArray: false, isPrimitive: false },
                isOptional: false,
                isReadonly: false,
                validators: [],
                discriminator: {
                  propertyName: 'kind',
                  mapping: {
                    file: 'FileResource',
                    folder: 'FolderResource',
                  },
                },
              },
            ],
          },
          // Enum with no values
          {
            name: 'EmptyEnum',
            fileName: 'empty-enum',
            isEnum: true,
            properties: [],
            enumValues: undefined,
          },
        ];

        const edgeDtoWriter = new DtoWriter(project, 'test-output/test-dto', []);
        await edgeDtoWriter.writeAll(edgeCaseModels);
      });

      it('should handle Pure OneOf with empty subTypes', () => {
        const emptyFile = project.getSourceFile('test-output/test-dto/dto/empty-oneof.dto.ts');
        // Should not generate anything meaningful, but should not crash
        expect(emptyFile).toBeDefined();
      });

      it('should handle discriminator with string rawType', () => {
        const discFile = project.getSourceFile(
          'test-output/test-dto/dto/string-discriminator-dto.dto.ts',
        );
        const discClass = discFile?.getClassOrThrow('StringDiscriminatorDto');
        const resourceProp = discClass?.getProperty('resource');

        expect(resourceProp).toBeDefined();

        const typeDecorator = resourceProp?.getDecorator('Type');
        expect(typeDecorator).toBeDefined();

        const args = typeDecorator?.getArguments();
        expect(args).toBeDefined();
        expect(args![0].getText()).toBe('() => BaseResource');
      });

      it('should handle Enum with no enumValues', () => {
        const enumFile = project.getSourceFile('test-output/test-dto/dto/empty-enum.enum.ts');
        expect(enumFile).toBeDefined();

        const enumDecl = enumFile?.getEnum('EmptyEnum');
        expect(enumDecl).toBeDefined();

        const members = enumDecl?.getMembers();
        expect(members).toEqual([]);
      });
    });
  });
});
