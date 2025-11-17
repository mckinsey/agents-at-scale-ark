import {InvalidArgumentError} from 'commander';

const SUPPORTED_OUTPUT_FORMATS = ['json', 'text'];

export const UNSUPPORTED_OUTPUT_FORMAT_MESSAGE = `unsupported "output" format`;
const VALID_OUTPUT_FORMATS_MESSAGE = `valid formats are: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`;
export function assertSupportedOutputFormat(format: string | undefined): void {
  if (format && !SUPPORTED_OUTPUT_FORMATS.includes(format)) {
    const message = `${UNSUPPORTED_OUTPUT_FORMAT_MESSAGE}: "${format}". ${VALID_OUTPUT_FORMATS_MESSAGE}`;
    throw new InvalidArgumentError(message);
  }
}
