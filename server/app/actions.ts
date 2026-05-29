'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { deleteFromInference, uploadToInference } from '@/lib/inference';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface UploadResult {
  ok: boolean;
  error?: string;
}

async function uploadImage(
  formData: FormData,
  kind: 'person' | 'garment',
): Promise<UploadResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'no file provided' };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `unsupported type: ${file.type || 'unknown'} (allowed: jpeg/png/webp)` };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `file too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max 10 MB)` };
  }

  let stored;
  try {
    stored = await uploadToInference(file, file.name, kind);
  } catch (e) {
    return { ok: false, error: `inference upload failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  const id = randomUUID();
  const now = Date.now();
  if (kind === 'person') {
    const label = (formData.get('label') as string | null) ?? null;
    db().prepare(
      'INSERT INTO people (id, image_url, label, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, stored.url, label, now);
  } else {
    const category = (formData.get('category') as string | null) ?? null;
    const note = (formData.get('note') as string | null) ?? null;
    // photo_type: 'flat-lay' (item only) or 'model' (worn by person/mannequin).
    // Anything else (missing/blank/garbage) is stored as NULL; the worker maps
    // NULL → 'flat-lay' to match the prior global default.
    const rawPhotoType = (formData.get('photo_type') as string | null) ?? null;
    const photoType =
      rawPhotoType === 'flat-lay' || rawPhotoType === 'model' ? rawPhotoType : null;
    db().prepare(
      'INSERT INTO garments (id, image_url, category, note, photo_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, stored.url, category, note, photoType, now);
  }

  revalidatePath('/');
  return { ok: true };
}

export async function uploadPerson(_prev: UploadResult, formData: FormData): Promise<UploadResult> {
  return uploadImage(formData, 'person');
}

export async function uploadGarment(_prev: UploadResult, formData: FormData): Promise<UploadResult> {
  return uploadImage(formData, 'garment');
}

interface ComposeResult {
  ok: boolean;
  generation_id?: string;
  error?: string;
}

export async function compose(
  _prev: ComposeResult,
  formData: FormData,
): Promise<ComposeResult> {
  const personId = formData.get('person_id') as string | null;
  const garmentId = formData.get('garment_id') as string | null;
  if (!personId || !garmentId) {
    return { ok: false, error: 'select a person and a garment' };
  }

  const d = db();
  const person = d.prepare('SELECT id FROM people WHERE id = ?').get(personId);
  const garment = d.prepare('SELECT id FROM garments WHERE id = ?').get(garmentId);
  if (!person || !garment) {
    return { ok: false, error: 'invalid selection' };
  }

  const id = randomUUID();
  d.prepare(`
    INSERT INTO generations (id, person_id, garment_id, status, created_at)
    VALUES (?, ?, ?, 'queued', ?)
  `).run(id, personId, garmentId, Date.now());

  revalidatePath('/');
  return { ok: true, generation_id: id };
}

interface DeleteResult {
  ok: boolean;
  error?: string;
}

async function deleteImage(
  id: string,
  kind: 'person' | 'garment',
): Promise<DeleteResult> {
  if (!id) return { ok: false, error: 'missing id' };
  const d = db();

  const table = kind === 'person' ? 'people' : 'garments';
  const fkColumn = kind === 'person' ? 'person_id' : 'garment_id';

  const row = d
    .prepare(`SELECT image_url FROM ${table} WHERE id = ?`)
    .get(id) as { image_url: string } | undefined;
  if (!row) return { ok: false, error: 'not found' };

  // Cascade: remove generations that reference this photo, plus their result
  // blobs on inference. Preserving history would require a separate soft-delete
  // column; for a personal-use MVP, "delete just means delete" is the right UX.
  const refRows = d
    .prepare(
      `SELECT id, result_url FROM generations WHERE ${fkColumn} = ?`,
    )
    .all(id) as Array<{ id: string; result_url: string | null }>;

  d.prepare(`DELETE FROM generations WHERE ${fkColumn} = ?`).run(id);
  d.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);

  // Best-effort inference cleanup. DB rows are already gone, so failures here
  // only leave orphan files on disk — they don't strand anything in the UI.
  const toDelete = [row.image_url, ...refRows.map(r => r.result_url).filter((u): u is string => !!u)];
  for (const url of toDelete) {
    try {
      await deleteFromInference(url);
    } catch (e) {
      console.warn(
        `[delete] inference delete failed for ${kind} ${id} (url=${url}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  revalidatePath('/');
  return { ok: true };
}

export async function deletePerson(id: string): Promise<DeleteResult> {
  return deleteImage(id, 'person');
}

export async function deleteGarment(id: string): Promise<DeleteResult> {
  return deleteImage(id, 'garment');
}
