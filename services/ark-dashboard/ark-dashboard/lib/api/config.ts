const getBaseURL = (): string => {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : null)
  );
};

const baseURL = getBaseURL();
if (!baseURL) {
  throw new Error('API base URL is not configured. Set NEXT_PUBLIC_API_BASE_URL environment variable.');
}

export const API_CONFIG = {
  // Use absolute URLs to bypass Next.js basePath - API calls go to /api/v1/* instead of /dashboard/api/v1/*
  baseURL,
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
} as const;
