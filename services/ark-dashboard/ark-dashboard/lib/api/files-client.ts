import { APIClient } from './client';
import { apiUrl } from './config';

export const FILES_API_BASE_URL = apiUrl('/api/v1/proxy/services/file-gateway-api');

export const filesApiClient = new APIClient(FILES_API_BASE_URL, {
  'Content-Type': 'application/json',
});
