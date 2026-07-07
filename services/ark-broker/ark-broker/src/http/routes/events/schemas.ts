import {z} from 'zod';

export const getEventsQuerySchema = z.object({
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
export type GetEventsQuery = z.infer<typeof getEventsQuerySchema>;
export type GetEventsQueryRaw = {
  watch?: 'true' | 'false';
  session_id?: string;
  cursor?: string;
  'from-beginning'?: 'true' | 'false';
};

export const postEventBodySchema = z
  .object({
    data: z.object({queryId: z.string().min(1)}).passthrough(),
    ttl_seconds: z.coerce.number().int().positive().optional(),
  })
  .passthrough();
export type PostEventBody = z.infer<typeof postEventBodySchema>;
