import {z} from 'zod';

export const getTracesQuerySchema = z.object({
  watch: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  session_id: z.string().optional(),
  cursor: z.coerce.number().int().nonnegative().optional(),
  'from-beginning': z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type GetTracesQuery = z.infer<typeof getTracesQuerySchema>;
export type GetTracesQueryRaw = {
  watch?: 'true' | 'false';
  session_id?: string;
  cursor?: string;
  'from-beginning'?: 'true' | 'false';
};
