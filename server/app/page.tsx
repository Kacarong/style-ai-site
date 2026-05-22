import { db, getMeta } from '@/lib/db';
import { inferenceHealth } from '@/lib/inference';
import Uploader, { GarmentLite, PersonLite } from './uploader';

export const dynamic = 'force-dynamic';

const WORKER_STALE_MS = 10_000; // worker writes heartbeat every ~2s; >10s = down

interface GenerationRow {
  id: string;
  person_id: string;
  garment_id: string;
  result_url: string | null;
  status: 'queued' | 'running' | 'done' | 'failed';
  error_message: string | null;
  created_at: number;
}

export default async function Home() {
  const online = await inferenceHealth();
  const d = db();

  const people = d.prepare(
    'SELECT id, image_url, label FROM people ORDER BY created_at DESC LIMIT 24',
  ).all() as PersonLite[];
  const garments = d.prepare(
    'SELECT id, image_url, category FROM garments ORDER BY created_at DESC LIMIT 24',
  ).all() as GarmentLite[];
  const generations = d.prepare(
    'SELECT id, person_id, garment_id, result_url, status, error_message, created_at FROM generations ORDER BY created_at DESC LIMIT 24',
  ).all() as GenerationRow[];

  const hb = getMeta('worker_heartbeat_at');
  const hbAge = hb ? Date.now() - Number(hb.value) : null;
  const workerLive = hbAge !== null && hbAge < WORKER_STALE_MS;

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 8 }}>style-ai-site</h1>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <Badge label="Inference" ok={online} okText="online" badText="offline" />
        <Badge
          label="Worker"
          ok={workerLive}
          okText={hbAge !== null ? `live (${(hbAge / 1000).toFixed(1)}s ago)` : 'live'}
          badText={hb ? `stale (${((hbAge ?? 0) / 1000).toFixed(0)}s)` : 'never seen'}
        />
      </div>

      {!online && (
        <Banner color="#fff4e5" border="#ffb84d">
          Inference 서버가 오프라인입니다. 본인 PC의 uvicorn이 떠 있는지 확인하세요. 업로드/합성이 실패합니다.
        </Banner>
      )}
      {online && !workerLive && (
        <Banner color="#fff4e5" border="#ffb84d">
          Worker가 떠 있지 않은 것 같습니다. <code>npm run worker</code>를 실행하세요. 큐에 쌓인 작업이 처리되지 않습니다.
        </Banner>
      )}

      <Uploader people={people} garments={garments} />

      <section style={{ marginTop: 32 }}>
        <h2>People ({people.length})</h2>
        <Grid items={people.map(p => ({ id: p.id, url: p.image_url, label: p.label }))} />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Garments ({garments.length})</h2>
        <Grid items={garments.map(g => ({ id: g.id, url: g.image_url, label: g.category }))} />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Generations ({generations.length})</h2>
        {generations.length === 0 ? (
          <p style={{ color: '#888' }}>아직 합성 기록이 없습니다.</p>
        ) : (
          <ul style={{ paddingLeft: 18 }}>
            {generations.map(g => (
              <li key={g.id} style={{ marginBottom: 8 }}>
                <code>{g.id.slice(0, 8)}</code> — <strong>{g.status}</strong>
                {g.result_url && (
                  <>
                    {' — '}
                    <a href={g.result_url} target="_blank" rel="noreferrer">result</a>
                  </>
                )}
                {g.error_message && <span style={{ color: 'crimson' }}> — {g.error_message}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Badge({ label, ok, okText, badText }: { label: string; ok: boolean; okText: string; badText: string }) {
  return (
    <span
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        background: ok ? '#e6f4ea' : '#fde7e9',
        color: ok ? '#137333' : '#a50e0e',
        fontSize: 13,
      }}
    >
      {label}: {ok ? okText : badText}
    </span>
  );
}

function Banner({ children, color, border }: { children: React.ReactNode; color: string; border: string }) {
  return (
    <div
      style={{
        background: color,
        border: `1px solid ${border}`,
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function Grid({ items }: { items: Array<{ id: string; url: string; label: string | null }> }) {
  if (items.length === 0) return <p style={{ color: '#888' }}>비어 있음.</p>;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: 12,
      }}
    >
      {items.map(it => (
        <figure key={it.id} style={{ margin: 0 }}>
          {/* plain <img> — the URL itself is signed (?t=<read_token>) */}
          <img
            src={it.url}
            alt={it.label ?? it.id}
            style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 4 }}
          />
          <figcaption style={{ fontSize: 12, marginTop: 4 }}>{it.label ?? it.id.slice(0, 8)}</figcaption>
        </figure>
      ))}
    </div>
  );
}
