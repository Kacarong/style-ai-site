import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface GenerationStatusRow {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  result_url: string | null;
  model_used: string | null;
  error_message: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = db().prepare(`
    SELECT id, status, result_url, model_used, error_message,
           created_at, started_at, finished_at
    FROM generations WHERE id = ?
  `).get(id) as GenerationStatusRow | undefined;

  if (!row) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(row);
}
