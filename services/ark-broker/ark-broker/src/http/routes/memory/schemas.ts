import {z} from 'zod';

export const postMessagesBodySchema = z.object({
  conversation_id: z.string(),
  query_id: z.string(),
  messages: z.array(z.unknown()),
  ttl_seconds: z.coerce.number().int().positive().optional(),
});
export type PostMessagesBody = z.infer<typeof postMessagesBodySchema>;

export const getMessagesQuerySchema = z.object({
  watch: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  conversation_id: z.string().optional(),
  query_id: z.string().optional(),
  cursor: z.coerce.number().int().nonnegative().optional(),
});
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
export type GetMessagesQueryRaw = {
  watch?: 'true' | 'false';
  conversation_id?: string;
  query_id?: string;
  cursor?: string;
};
