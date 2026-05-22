import { db } from '@/lib/db';
import { inferenceHealth } from '@/lib/inference';

export const dynamic = 'force-dynamic';

interface PersonRow {
  id: string;
  image_url: string;
  label: string | null;
}
interface GarmentRow {
  id: string;
  image_url: string;
  category: string | null;
}
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
  const people = d.prepare('SELECT id, image_url, label FROM people ORDER BY created_at DESC LIMIT 12').all() as PersonRow[];
  const garments = d.prepare('SELECT id, image_url, category FROM garments ORDER BY created_at DESC LIMIT 12').all() as GarmentRow[];
  const generations = d.prepare('SELECT id, person_id, garment_id, result_url, status, error_message, created_at FROM generations ORDER BY created_at DESC LIMIT 12').all() as GenerationRow[];

  return (
    <main>
      <h1>style-ai-site</h1>
      <p style={{ marginTop: 0 }}>
        Inference:{' '}
        <span style={{ color: online ? 'green' : 'crimson' }}>
          {online ? 'online' : 'offline'}
        </span>
      </p>

      <section>
        <h2>People</h2>
        <p>Upload UI: TODO</p>
        <Grid items={people.map(p => ({ id: p.id, url: p.image_url, label: p.label }))} />
      </section>

      <section>
        <h2>Garments</h2>
        <p>Upload UI: TODO</p>
        <Grid items={garments.map(g => ({ id: g.id, url: g.image_url, label: g.category }))} />
      </section>

      <section>
        <h2>Generations</h2>
        <p>Compose UI: TODO</p>
        <ul>
          {generations.map(g => (
            <li key={g.id}>
              {g.id} — {g.status}
              {g.result_url ? <> — <a href={g.result_url}>result</a></> : null}
              {g.error_message ? <> — {g.error_message}</> : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Grid({ items }: { items: Array<{ id: string; url: string; label: string | null }> }) {
  if (items.length === 0) return <p><em>empty</em></p>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
      {items.map(it => (
        <figure key={it.id} style={{ margin: 0 }}>
          {/* plain <img> so browsers send no Authorization header; the URL itself is signed */}
          <img src={it.url} alt={it.label ?? it.id} style={{ width: '100%', height: 120, objectFit: 'cover' }} />
          <figcaption style={{ fontSize: 12 }}>{it.label ?? it.id.slice(0, 8)}</figcaption>
        </figure>
      ))}
    </div>
  );
}
