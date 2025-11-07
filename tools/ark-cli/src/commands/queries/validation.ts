const SUPPORTED_OUTPUT_FORMATS = ['json', 'text'];

export class UnsupportedOutputFormatError extends Error {
  constructor(format: string) {
    const supportedFormats = SUPPORTED_OUTPUT_FORMATS.join(', ');
    super(
      `unsupported output format: ${format}. Supported formats: ${supportedFormats}`
    );
    this.name = 'UnsupportedOutputFormatError';
  }
}

export function assertSupportedOutputFormat(format: string | undefined): void {
  if (format && !SUPPORTED_OUTPUT_FORMATS.includes(format)) {
    throw new UnsupportedOutputFormatError(format);
  }
}
