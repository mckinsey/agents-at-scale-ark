import { APIClient } from './client';

export const filesApiClient = new APIClient(
  process.env.NEXT_PUBLIC_ARK_API_BASE_URL ||
    '/api/v1/proxy/service/file-gateway-api',
  { 'Content-Type': 'application/json' },
);
