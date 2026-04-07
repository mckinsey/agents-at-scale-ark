import { NextResponse } from 'next/server';

import { fetchDemos } from '../../lib/demos';

export async function GET() {
  try {
    const demos = await fetchDemos();
    return NextResponse.json(demos);
  } catch (error) {
    console.error('Error fetching demos:', error);
    return NextResponse.json({ error: 'Failed to fetch demos' }, { status: 500 });
  }
}
