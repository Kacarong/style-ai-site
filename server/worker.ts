// Separate Node process. Polls for queued generations and dispatches them to
// the inference server. Run with `npm run worker`.
//
// Why a separate process: Next.js dev/prod can restart freely; a setInterval
// in the Next.js process would double-run on HMR and stop on rebuild.

// Next.js auto-loads .env / .env.local but plain Node (tsx) does not.
// Load them ourselves so env.ts can read INFERENCE_BASE_URL etc.
// Order matches Next.js: .env first, then .env.local overrides.
import { existsSync } from 'node:fs';
for (const name of ['.env', '.env.local']) {
  if (existsSync(name)) {
    try { process.loadEnvFile(name); } catch { /* requires Node 20.12+ */ }
  }
}

import { db, setMeta } from './lib/db';
import { runTryon } from './lib/inference';

const POLL_INTERVAL_MS = 2000;

interface QueuedGeneration {
  id: string;
  person_url: string;
  garment_url: string;
}

async function tick() {
  const d = db();
  // Heartbeat: write our timestamp every tick so the UI can detect "worker not running".
  setMeta('worker_heartbeat_at', String(Date.now()));

  const row = d.prepare(`
    SELECT g.id AS id, p.image_url AS person_url, ga.image_url AS garment_url
    FROM generations g
    JOIN people p ON p.id = g.person_id
    JOIN garments ga ON ga.id = g.garment_id
    WHERE g.status = 'queued'
    ORDER BY g.created_at ASC
    LIMIT 1
  `).get() as QueuedGeneration | undefined;

  if (!row) return;

  const claim = d.prepare(`
    UPDATE generations
    SET status = 'running', started_at = ?
    WHERE id = ? AND status = 'queued'
  `).run(Date.now(), row.id);

  if (claim.changes === 0) return; // someone else picked it

  console.log(`[worker] running generation ${row.id}`);
  try {
    const result = await runTryon({
      generation_id: row.id,
      person_url: row.person_url,
      garment_url: row.garment_url,
    });
    d.prepare(`
      UPDATE generations
      SET status = 'done', result_url = ?, model_used = ?, cost_usd = ?, finished_at = ?
      WHERE id = ?
    `).run(result.result_url, result.model_used, result.cost_usd, Date.now(), row.id);
    console.log(`[worker] done ${row.id}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    d.prepare(`
      UPDATE generations
      SET status = 'failed', error_message = ?, finished_at = ?
      WHERE id = ?
    `).run(msg, Date.now(), row.id);
    console.error(`[worker] failed ${row.id}: ${msg}`);
  }
}

async function main() {
  console.log('[worker] started');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error('[worker] tick error:', e);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();
