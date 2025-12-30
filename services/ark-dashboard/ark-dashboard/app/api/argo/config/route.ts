import { NextResponse } from 'next/server';

const ARGO_SERVER_URL =
  process.env.ARGO_SERVER_URL ||
  'http://argo-workflows-server.argo-workflows.svc.cluster.local:2746';

export async function GET() {
  return NextResponse.json({
    baseUrl: ARGO_SERVER_URL,
  });
}
