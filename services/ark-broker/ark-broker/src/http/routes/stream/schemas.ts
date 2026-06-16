import {z} from 'zod';

export interface StreamError {
  message: string;
  type: string;
  code?: string;
}

export const getStreamQuerySchema = z.object({
  'from-beginning': z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  'wait-for-query': z.coerce.number().int().nonnegative().optional(),
  'max-chunk-size': z.coerce.number().int().positive().optional(),
});
export type GetStreamQuery = z.infer<typeof getStreamQuerySchema>;
export type GetStreamQueryRaw = {
  'from-beginning'?: 'true' | 'false';
  'wait-for-query'?: string;
  'max-chunk-size'?: string;
};
