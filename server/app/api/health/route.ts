import { NextResponse } from 'next/server';
import { inferenceHealth } from '@/lib/inference';

export async function GET() {
  const online = await inferenceHealth();
  return NextResponse.json({ ok: true, inference: online ? 'online' : 'offline' });
}
