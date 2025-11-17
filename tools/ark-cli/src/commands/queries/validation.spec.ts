import {jest} from '@jest/globals';
import {InvalidArgumentError} from 'commander';

import {
  assertSupportedOutputFormat,
  UNSUPPORTED_OUTPUT_FORMAT_MESSAGE,
} from './validation.js';

jest.spyOn(console, 'error').mockImplementation(() => {});

describe('queries validation', () => {
  describe('assertSupportedOutputFormat', () => {
    it('should not throw for supported formats', () => {
      expect(() => assertSupportedOutputFormat('json')).not.toThrow();
      expect(() => assertSupportedOutputFormat('text')).not.toThrow();
    });

    it('should not throw when format is undefined', () => {
      expect(() => assertSupportedOutputFormat(undefined)).not.toThrow();
    });

    it('should throw InvalidArgumentError for unsupported format', () => {
      expect(() => assertSupportedOutputFormat('xml')).toThrow(
        InvalidArgumentError
      );
    });

    it('should include format and supported formats in error message', () => {
      expect(() => assertSupportedOutputFormat('xml')).toThrow(
        UNSUPPORTED_OUTPUT_FORMAT_MESSAGE
      );
    });

    it('should work with various invalid formats', () => {
      const invalidFormats = ['yaml', 'csv', 'html', 'pdf'];

      for (const format of invalidFormats) {
        expect(() => assertSupportedOutputFormat(format)).toThrow(
          InvalidArgumentError
        );
      }
    });
  });
});
