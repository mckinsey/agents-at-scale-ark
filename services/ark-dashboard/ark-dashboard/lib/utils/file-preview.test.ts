import { describe, expect, it } from 'vitest';

import {
  getLanguageFromExtension,
  isImageFile,
  isJsonFile,
  isSpreadsheetFile,
  isSvgFile,
  isZipFile,
} from './file-preview';

describe('file-preview utils', () => {
  describe('getLanguageFromExtension', () => {
    it('should return correct language for common extensions', () => {
      expect(getLanguageFromExtension('js')).toBe('javascript');
      expect(getLanguageFromExtension('py')).toBe('python');
      expect(getLanguageFromExtension('go')).toBe('go');
      expect(getLanguageFromExtension('rs')).toBe('rust');
    });

    it('should return null for unknown extensions', () => {
      expect(getLanguageFromExtension('xyz')).toBeNull();
      expect(getLanguageFromExtension(undefined)).toBeNull();
    });
  });

  describe('isImageFile', () => {
    it('should return true for image extensions', () => {
      expect(isImageFile('jpg')).toBe(true);
      expect(isImageFile('png')).toBe(true);
      expect(isImageFile('gif')).toBe(true);
      expect(isImageFile('webp')).toBe(true);
    });

    it('should return false for non-image extensions', () => {
      expect(isImageFile('txt')).toBe(false);
      expect(isImageFile('pdf')).toBe(false);
      expect(isImageFile(undefined)).toBe(false);
    });
  });

  describe('isSvgFile', () => {
    it('should return true for svg extension', () => {
      expect(isSvgFile('svg')).toBe(true);
    });

    it('should return false for non-svg extensions', () => {
      expect(isSvgFile('png')).toBe(false);
      expect(isSvgFile(undefined)).toBe(false);
    });
  });

  describe('isJsonFile', () => {
    it('should return true for json extension', () => {
      expect(isJsonFile('json')).toBe(true);
      expect(isJsonFile('JSON')).toBe(true); // Test case insensitive
    });

    it('should return false for non-json extensions', () => {
      expect(isJsonFile('jsonc')).toBe(false); // Only plain json is accepted
      expect(isJsonFile('json5')).toBe(false);
      expect(isJsonFile('xml')).toBe(false);
      expect(isJsonFile(undefined)).toBe(false);
    });
  });

  describe('isZipFile', () => {
    it('should return true for zip extension', () => {
      expect(isZipFile('zip')).toBe(true);
    });

    it('should return false for non-zip extensions', () => {
      expect(isZipFile('tar')).toBe(false);
      expect(isZipFile('gz')).toBe(false);
      expect(isZipFile(undefined)).toBe(false);
    });
  });

  describe('isSpreadsheetFile', () => {
    it('should return true for spreadsheet extensions', () => {
      expect(isSpreadsheetFile('xlsx')).toBe(true);
      expect(isSpreadsheetFile('xls')).toBe(true);
      expect(isSpreadsheetFile('csv')).toBe(true);
      expect(isSpreadsheetFile('tsv')).toBe(true);
    });

    it('should return false for non-spreadsheet extensions', () => {
      expect(isSpreadsheetFile('txt')).toBe(false);
      expect(isSpreadsheetFile('pdf')).toBe(false);
      expect(isSpreadsheetFile(undefined)).toBe(false);
    });
  });
});
