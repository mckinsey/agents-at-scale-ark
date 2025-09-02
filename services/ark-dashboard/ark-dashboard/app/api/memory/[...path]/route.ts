import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const { path } = resolvedParams;
    const searchParams = request.nextUrl.searchParams;
    const namespace = searchParams.get('namespace') || 'default';
    const memoryName = searchParams.get('memoryName') || 'postgres-memory';

    // First get the memory resource to find its endpoint
    const arkApiBase = process.env.ARK_API_BASE_URL || 'http://ark-api:8000';
    const memoryDetailUrl = `${arkApiBase}/v1/namespaces/${namespace}/memories/${memoryName}`;
    
    const memoryResponse = await fetch(memoryDetailUrl);
    if (!memoryResponse.ok) {
      return NextResponse.json(
        { error: `Memory resource not found: ${memoryName}` },
        { status: 404 }
      );
    }
    
    const memoryDetail = await memoryResponse.json();
    const memoryServiceUrl = memoryDetail?.status?.lastResolvedAddress;
    
    if (!memoryServiceUrl) {
      return NextResponse.json(
        { error: `No resolved address for memory ${memoryName}` },
        { status: 500 }
      );
    }

    // Proxy the request to the memory service
    const targetPath = path.join('/');
    const targetUrl = `${memoryServiceUrl}/${targetPath}`;
    
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Memory service error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Memory API proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}