import {z} from 'zod';

export const getSessionsQuerySchema = z.object({
  watch: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  session_id: z.string().optional(),
  status: z.enum(['active', 'idle', 'error']).optional(),
  sort: z.enum(['date', 'name', 'conversations']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});
export type GetSessionsQuery = z.infer<typeof getSessionsQuerySchema>;
export type GetSessionsQueryRaw = {
  watch?: 'true' | 'false';
  session_id?: string;
  status?: 'active' | 'idle' | 'error';
  sort?: 'date' | 'name' | 'conversations';
  order?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: string;
  cursor?: string;
};

export const postSessionEventBodySchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .passthrough();
export type PostSessionEventBody = z.infer<typeof postSessionEventBodySchema>;
