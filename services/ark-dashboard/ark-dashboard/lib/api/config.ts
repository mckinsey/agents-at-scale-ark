const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const ORIGIN_OVERRIDE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

function computeBaseURL(): string {
  if (ORIGIN_OVERRIDE) return ORIGIN_OVERRIDE;
  if (typeof window !== 'undefined') return `${window.location.origin}${BASE_PATH}`;
  return BASE_PATH;
}

export const API_CONFIG = {
  baseURL: computeBaseURL(),
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
} as const;

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_CONFIG.baseURL}${normalized}`;
}
