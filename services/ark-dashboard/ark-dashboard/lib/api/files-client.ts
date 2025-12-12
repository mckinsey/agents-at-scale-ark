import { APIClient } from './client';

export const filesApiClient = new APIClient(
  process.env.NEXT_PUBLIC_FILES_API_BASE_URL ||
    'http://file-gateway.127.0.0.1.nip.io:8080',
  { 'Content-Type': 'application/json' },
);
