// Client for the inference FastAPI service. Imported from:
//   - Next.js server components / route handlers (server side of Next process)
//   - server/worker.ts (separate Node process)
// Must NOT be imported from a "use client" component. The SHARED_SECRET it
// reads via env.ts is server-only and is never sent to the browser.
//
// We don't use the `server-only` npm package because it throws in any plain
// Node process (the worker), not just in client bundles. The same guarantee
// is enforced by: env.ts reads SHARED_SECRET (no NEXT_PUBLIC_), and this file
// is never reachable from a "use client" tree.

import { env } from './env';

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.SHARED_SECRET}` };
}

export interface StorageUploadResult {
  id: string;
  url: string; // signed read URL, includes ?t=<read_token>
}

/**
 * Best-effort delete of an inference-side blob by its signed URL.
 *
 * The URL is the same one we stored in SQLite; we extract <id> from the path
 * and DELETE /storage/<id> with Bearer. 404s are swallowed (idempotent: the
 * file may already be gone). Other errors propagate so callers can decide
 * whether to surface them.
 */
export async function deleteFromInference(signedUrl: string): Promise<void> {
  let id: string;
  try {
    const u = new URL(signedUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'storage' || !parts[1]) {
      throw new Error(`not a storage URL: ${signedUrl}`);
    }
    id = parts[1];
  } catch (e) {
    throw new Error(
      `cannot parse storage URL: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const res = await fetch(
    `${env.INFERENCE_BASE_URL}/storage/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`inference delete failed: ${res.status} ${await res.text()}`);
  }
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
  // Free-text garment category (e.g. "상의", "tops"). The inference server's
  // FASHN provider normalizes this to its own enum; mock ignores it.
  category?: string | null;
  // Per-request override of FASHN's garment_photo_type. The inference server
  // falls back to its .env default when this is null/undefined.
  garment_photo_type?: 'flat-lay' | 'model' | null;
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

export interface InferenceHealth {
  online: boolean;
  provider: string | null;
}

export async function inferenceHealth(): Promise<InferenceHealth> {
  try {
    const res = await fetch(`${env.INFERENCE_BASE_URL}/healthz`, {
      // /healthz is unauthenticated; short timeout
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { online: false, provider: null };
    const data = (await res.json()) as { ok?: boolean; provider?: string };
    return { online: data.ok !== false, provider: data.provider ?? null };
  } catch {
    return { online: false, provider: null };
  }
}
