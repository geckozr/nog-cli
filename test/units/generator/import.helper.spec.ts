import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DecoratorHelper } from '../../../src/core/generator/helpers/decorator.helper';
import { ImportHelper } from '../../../src/core/generator/helpers/import.helper';
import { TypeHelper } from '../../../src/core/generator/helpers/type.helper';
import { IrModel } from '../../../src/core/ir/interfaces';

// 1. Mock delle dipendenze statiche
vi.mock('../../../src/core/generator/helpers/type.helper');
vi.mock('../../../src/core/generator/helpers/decorator.helper');

describe('ImportHelper', () => {
  // 2. Creiamo un mock parziale per SourceFile
  // Non serve un vero oggetto ts-morph, basta un oggetto che abbia il metodo che ci interessa spiare.
  let mockSourceFile: any;

  beforeEach(() => {
    mockSourceFile = {
      addImportDeclaration: vi.fn(),
    };

    vi.clearAllMocks();

    // Setup default behaviors per i mock
    vi.mocked(DecoratorHelper.collectDecoratorNames).mockReturnValue([]);
    vi.mocked(TypeHelper.irTypeToString).mockReturnValue('string');
    vi.mocked(TypeHelper.needsImport).mockReturnValue(false);
    // Mock semplice che ritorna il nome in lowercase come filename
    vi.mocked(TypeHelper.getFileName).mockImplementation((name) => name.toLowerCase());
    vi.mocked(TypeHelper.extractRecordValueType).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('addDtoImports', () => {
    it('should add standard class-validator decorators', () => {
      const model: IrModel = {
        name: 'TestDto',
        fileName: 'test-dto',
        isEnum: false,
        properties: [
          {
            name: 'name',
            isOptional: false,
            type: { rawType: 'string', isArray: false, isPrimitive: true },
            validators: [],
          } as any,
        ],
      };

      ImportHelper.addDtoImports(mockSourceFile, model);

      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleSpecifier: 'class-validator',
          // IsNotEmpty per campi required, IsString perché è stringa
          namedImports: expect.arrayContaining(['IsNotEmpty', 'IsString']),
        }),
      );
    });

    it('should import external DTOs when referenced', () => {
      // Simuliamo che RoleDto necessiti di import
      vi.mocked(TypeHelper.needsImport).mockReturnValue(true);

      const model: IrModel = {
        name: 'UserDto',
        fileName: 'user-dto',
        isEnum: false,
        properties: [
          {
            name: 'role',
            isOptional: true,
            type: { rawType: 'RoleDto', isArray: false, isPrimitive: false },
            validators: [],
          } as any,
        ],
      };

      const allModels: IrModel[] = [
        { name: 'RoleDto', fileName: 'role-dto', isEnum: false } as any,
      ];

      ImportHelper.addDtoImports(mockSourceFile, model, allModels);

      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: './role-dto.dto',
        namedImports: ['RoleDto'],
      });
    });

    it('should handle Record<string, CustomType> and import CustomType', () => {
      // CONFIGURAZIONE SPECIFICA PER IL TEST RECORD
      vi.mocked(TypeHelper.extractRecordValueType).mockReturnValue('UserRecords');
      vi.mocked(TypeHelper.getFileName).mockReturnValue('user-records');

      const model: IrModel = {
        name: 'UserDto',
        fileName: 'user-dto',
        isEnum: false,
        properties: [
          {
            name: 'metadata',
            type: { rawType: 'Record<string, UserRecords>', isArray: false, isPrimitive: false },
            isOptional: false,
            isReadonly: false,
            validators: [],
          } as any,
        ],
      };

      // Passiamo UserRecords come modello esistente per fargli risolvere l'estensione .dto
      const allModels: IrModel[] = [
        { name: 'UserRecords', fileName: 'user-records', isEnum: false } as any,
      ];

      ImportHelper.addDtoImports(mockSourceFile, model, allModels);

      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: './user-records.dto',
        namedImports: ['UserRecords'],
      });
    });

    it('should import Enums with .enum extension', () => {
      vi.mocked(TypeHelper.needsImport).mockReturnValue(true);

      const model: IrModel = {
        name: 'UserDto',
        fileName: 'user-dto',
        isEnum: false,
        properties: [
          {
            name: 'status',
            type: { rawType: 'StatusEnum', isArray: false, isPrimitive: false },
            validators: [],
          } as any,
        ],
      };

      const allModels: IrModel[] = [
        { name: 'StatusEnum', fileName: 'status.enum', isEnum: true } as any,
      ];

      ImportHelper.addDtoImports(mockSourceFile, model, allModels);

      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: './status.enum.enum',
        namedImports: ['StatusEnum'],
      });
    });

    it('should NOT import self', () => {
      vi.mocked(TypeHelper.needsImport).mockReturnValue(true);

      const model: IrModel = {
        name: 'Node',
        fileName: 'node',
        isEnum: false,
        properties: [
          {
            name: 'parent',
            type: { rawType: 'Node', isArray: false, isPrimitive: false },
            validators: [],
          } as any,
        ],
      };

      ImportHelper.addDtoImports(mockSourceFile, model, [model]);

      // Verifica che non venga chiamato con namedImports contenente 'Node'
      const calls = mockSourceFile.addImportDeclaration.mock.calls;
      const nodeImports = calls.filter(
        (args: any[]) => args[0].namedImports && args[0].namedImports.includes('Node'),
      );
      expect(nodeImports).toHaveLength(0);
    });

    it('should import class-transformer Type for Date fields', () => {
      const model: IrModel = {
        name: 'Event',
        fileName: 'event',
        isEnum: false,
        properties: [
          {
            name: 'when',
            type: { rawType: 'Date', isArray: false, isPrimitive: false },
            validators: [{ type: 'IS_DATE' }],
            isOptional: false,
          } as any,
        ],
      };

      ImportHelper.addDtoImports(mockSourceFile, model);

      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: 'class-transformer',
        namedImports: ['Type'],
      });
    });
  });

  describe('addServiceImports', () => {
    it('should add standard NestJS and RxJS imports', () => {
      const service: IrService = {
        name: 'UserService',
        operations: new Map(),
      };

      ImportHelper.addServiceImports(mockSourceFile, service, []);

      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: '@nestjs/common',
        namedImports: ['Injectable'],
      });
      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: '@nestjs/axios',
        namedImports: ['HttpService'],
      });
      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: 'rxjs',
        namedImports: ['Observable', 'firstValueFrom'],
      });
    });

    it('should import DTOs used in operation parameters', () => {
      vi.mocked(TypeHelper.needsImport).mockReturnValue(true);

      const service: IrService = {
        name: 'UserService',
        operations: new Map([
          [
            'op1',
            {
              parameters: [{ type: { rawType: 'CreateUserDto' } }],
              returnType: { rawType: 'void' },
            } as any,
          ],
        ]),
      };

      const allModels: IrModel[] = [
        { name: 'CreateUserDto', fileName: 'create-user', isEnum: false } as any,
      ];

      ImportHelper.addServiceImports(mockSourceFile, service, allModels);

      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: '../dto/create-user.dto',
        namedImports: ['CreateUserDto'],
      });
    });

    it('should handle Union Types in imports', () => {
      vi.mocked(TypeHelper.needsImport).mockReturnValue(true);

      const service: IrService = {
        name: 'UserService',
        operations: new Map([
          [
            'op1',
            {
              parameters: [],
              returnType: { rawType: ['UserDto', 'AdminDto'] }, // Union
            } as any,
          ],
        ]),
      };

      const allModels: IrModel[] = [
        { name: 'UserDto', fileName: 'user', isEnum: false } as any,
        { name: 'AdminDto', fileName: 'admin', isEnum: false } as any,
      ];

      ImportHelper.addServiceImports(mockSourceFile, service, allModels);

      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: '../dto/user.dto',
        namedImports: ['UserDto'],
      });
      expect(mockSourceFile.addImportDeclaration).toHaveBeenCalledWith({
        moduleSpecifier: '../dto/admin.dto',
        namedImports: ['AdminDto'],
      });
    });

    it('should NOT import value type of Record if it is a built-in type (e.g. Record<string, string>)', () => {
      // Setup: TypeHelper estrae 'string', che è un tipo built-in
      vi.mocked(TypeHelper.extractRecordValueType).mockReturnValue('string');
      // Importante: needsImport deve tornare false per i tipi built-in,
      // altrimenti verrebbe importato nel ciclo principale "Process Property Imports"
      vi.mocked(TypeHelper.needsImport).mockReturnValue(false);

      const model: IrModel = {
        name: 'DictionaryDto',
        fileName: 'dictionary-dto',
        isEnum: false,
        properties: [
          {
            name: 'labels',
            type: { rawType: 'Record<string, string>', isArray: false, isPrimitive: false },
            validators: [],
            isOptional: false,
          } as any,
        ],
      };

      ImportHelper.addDtoImports(mockSourceFile, model, []);

      // Verifica: Non deve esserci nessun import chiamato 'string'
      expect(mockSourceFile.addImportDeclaration).not.toHaveBeenCalledWith(
        expect.objectContaining({
          namedImports: expect.arrayContaining(['string']),
        }),
      );

      // Verifica aggiuntiva: controlliamo che non abbia provato a importare nulla relativo al Record
      // (a parte class-validator se ci fossero validatori)
      const calls = mockSourceFile.addImportDeclaration.mock.calls;
      const recordImports = calls.filter(
        (args: any[]) => args[0].moduleSpecifier && args[0].moduleSpecifier.includes('string'),
      );
      expect(recordImports).toHaveLength(0);
    });
  });
});
