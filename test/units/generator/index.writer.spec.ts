import { beforeEach, describe, expect, it } from 'vitest';

import { AstPrinter } from '../../../src/core/generator/writers/core/ast-printer';
import { HeaderGenerator } from '../../../src/core/generator/writers/core/header-generator';
import { IndexWriter } from '../../../src/core/generator/writers/index.writer';

describe('IndexWriter', () => {
  let indexWriter: IndexWriter;

  beforeEach(() => {
    const printer = new AstPrinter();
    const headerGenerator = new HeaderGenerator();
    indexWriter = new IndexWriter(printer, headerGenerator);
  });

  describe('generate', () => {
    it('should generate a simple index file (barrel)', async () => {
      const fileNames = ['module1', 'module2'];
      const cliVersion = '0.10.6';
      const specTitle = 'Address Autocomplete API';
      const specVersion = '1.0.0';

      const index = await indexWriter.generate(fileNames, cliVersion, specTitle, specVersion);

      expect(index.generatedCode).toContain(
        `// generated with nog-cli v${cliVersion} - spec: ${specTitle} v${specVersion}`,
      );
      expect(index.generatedCode).toContain("export * from './module1';");
      expect(index.generatedCode).toContain("export * from './module2';");
    });

    it('should generate hundreds of exports without crashing in less than 50ms', async () => {
      const fileNames = Array.from({ length: 100 }, (_, i) => `module${i + 1}`);
      const cliVersion = '0.10.6';
      const specTitle = 'Address Autocomplete API';
      const specVersion = '1.0.0';

      const startTime = performance.now();
      const index = await indexWriter.generate(fileNames, cliVersion, specTitle, specVersion);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(index.generatedCode).toContain(
        `// generated with nog-cli v${cliVersion} - spec: ${specTitle} v${specVersion}`,
      );
      for (let i = 1; i <= 100; i++) {
        expect(index.generatedCode).toContain(`export * from './module${i}';`);
      }
      expect(duration).toBeLessThan(50);
    });

    it('should generate a DTO barrel mixing .dto and .enum entries', async () => {
      const fileNames = ['user-profile.dto', 'record.dto', 'status.enum'];

      const index = await indexWriter.generate(fileNames, '0.10.6', 'Spec', '1.0.0');

      expect(index.filename).toBe('index.ts');
      expect(index.generatedCode).toContain("export * from './user-profile.dto';");
      expect(index.generatedCode).toContain("export * from './record.dto';");
      expect(index.generatedCode).toContain("export * from './status.enum';");
    });

    it('should generate a service barrel with .service extension', async () => {
      const fileNames = ['users-service.service', 'auth-service.service'];

      const index = await indexWriter.generate(fileNames, '0.10.6', 'Spec', '1.0.0');

      expect(index.generatedCode).toContain("export * from './users-service.service';");
      expect(index.generatedCode).toContain("export * from './auth-service.service';");
    });

    it('should generate a root barrel re-exporting subfolders and top-level files as-is', async () => {
      const fileNames = [
        'dto',
        'services',
        'api.module',
        'api.configuration',
        'api.types',
        'api.utils',
      ];

      const index = await indexWriter.generate(fileNames, '0.10.6', 'Spec', '1.0.0');

      expect(index.generatedCode).toContain("export * from './dto';");
      expect(index.generatedCode).toContain("export * from './services';");
      expect(index.generatedCode).toContain("export * from './api.module';");
      expect(index.generatedCode).toContain("export * from './api.configuration';");
      expect(index.generatedCode).toContain("export * from './api.types';");
      expect(index.generatedCode).toContain("export * from './api.utils';");
    });
  });
});
