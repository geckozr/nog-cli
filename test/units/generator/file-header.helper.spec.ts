import { describe, expect, it } from 'vitest';

import { FileHeaderHelper } from '../../../src/core/generator/helpers/file-header.helper';

describe('FileHeaderHelper', () => {
  it('should return the correct header with linting disables', () => {
    const header = FileHeaderHelper.getHeader();

    expect(header).toContain('/* tslint:disable */');
    expect(header).toContain('/* eslint-disable */');
  });
});
