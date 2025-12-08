import { NextResponse } from 'next/server';

const ARACHNE_API_URL = process.env.ARACHNE_API_URL || 'http://localhost:8080';

export async function GET() {
  try {
    const response = await fetch(`${ARACHNE_API_URL}/api/jobs`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Jobs API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
