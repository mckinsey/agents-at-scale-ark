/**
 * Server-side API client for making direct backend calls
 * This client is used when running in Node.js context (SSR, API routes)
 * where window.location is not available
 */

import { APIClient } from './client';

// Get backend service configuration from environment variables
// These match the middleware configuration
const getBackendUrl = () => {
  const host = process.env.ARK_API_SERVICE_HOST || 'localhost';
  const port = process.env.ARK_API_SERVICE_PORT || '8000';
  const protocol = process.env.ARK_API_SERVICE_PROTOCOL || 'http';

  return `${protocol}://${host}:${port}`;
};

// Create a server-side API client that directly calls the backend
export const serverApiClient = new APIClient(
  getBackendUrl(),
  {
    'Content-Type': 'application/json',
  }
);