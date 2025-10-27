export const API_CONFIG = {
  // Use absolute URLs to bypass Next.js basePath - API calls go to /api/v1/* instead of /dashboard/api/v1/*
  baseURL:
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : ''),
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
} as const;
