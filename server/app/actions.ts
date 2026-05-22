'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { uploadToInference } from '@/lib/inference';

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
    db().prepare(
      'INSERT INTO garments (id, image_url, category, note, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, stored.url, category, note, now);
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
