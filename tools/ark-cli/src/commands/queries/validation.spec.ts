import {jest} from '@jest/globals';

jest.spyOn(console, 'error').mockImplementation(() => {});

import {assertSupportedOutputFormat, UnsupportedOutputFormatError} from './validation.js';

describe('queries validation', () => {
  describe('assertSupportedOutputFormat', () => {
    it('should not throw for supported formats', () => {
      expect(() => assertSupportedOutputFormat('json')).not.toThrow();
      expect(() => assertSupportedOutputFormat('text')).not.toThrow();
    });

    it('should not throw when format is undefined', () => {
      expect(() => assertSupportedOutputFormat(undefined)).not.toThrow();
    });

    it('should throw UnsupportedOutputFormatError for unsupported format', () => {
      expect(() => assertSupportedOutputFormat('xml')).toThrow(
        UnsupportedOutputFormatError
      );
    });

    it('should include format and supported formats in error message', () => {
      expect(() => assertSupportedOutputFormat('xml')).toThrow(
        'unsupported output format: xml. Supported formats: json, text'
      );
    });

    it('should work with various invalid formats', () => {
      const invalidFormats = ['yaml', 'csv', 'html', 'pdf'];

      for (const format of invalidFormats) {
        expect(() => assertSupportedOutputFormat(format)).toThrow(
          UnsupportedOutputFormatError
        );
      }
    });
  });
});
