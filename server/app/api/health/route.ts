import { NextResponse } from 'next/server';
import { inferenceHealth } from '@/lib/inference';

export async function GET() {
  const h = await inferenceHealth();
  return NextResponse.json({
    ok: true,
    inference: h.online ? 'online' : 'offline',
    provider: h.provider,
  });
}
