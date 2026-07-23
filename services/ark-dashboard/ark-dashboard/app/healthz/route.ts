import { NextResponse } from 'next/server';

// Liveness/readiness endpoint for Kubernetes probes. Kept dependency-free so it
// reports the Next.js server process is up and serving, independent of backend
// state. Allow-listed in middleware.ts so auth never redirects the probe.
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok' });
}
