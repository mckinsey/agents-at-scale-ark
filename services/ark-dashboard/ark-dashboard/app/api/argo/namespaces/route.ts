import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(['default', 'argo-workflows']);
}
