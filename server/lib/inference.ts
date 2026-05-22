// Server-only client for the inference FastAPI service.
// Uses Bearer SHARED_SECRET. Never importable from client components.

import 'server-only';
import { env } from './env';

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.SHARED_SECRET}` };
}

export interface StorageUploadResult {
  id: string;
  url: string; // signed read URL, includes ?t=<read_token>
}

export async function uploadToInference(
  file: Blob,
  filename: string,
  kind: 'person' | 'garment' | 'result',
): Promise<StorageUploadResult> {
  const form = new FormData();
  form.append('file', file, filename);
  form.append('kind', kind);

  const res = await fetch(`${env.INFERENCE_BASE_URL}/storage/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    throw new Error(`inference upload failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface TryonRequest {
  generation_id: string;
  person_url: string;
  garment_url: string;
  provider?: string;
}

export interface TryonResult {
  result_url: string;
  model_used: string;
  cost_usd: number;
}

export async function runTryon(req: TryonRequest): Promise<TryonResult> {
  const res = await fetch(`${env.INFERENCE_BASE_URL}/tryon`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`inference tryon failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function inferenceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${env.INFERENCE_BASE_URL}/healthz`, {
      // /healthz is unauthenticated; short timeout
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
