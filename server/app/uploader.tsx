'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { compose, uploadGarment, uploadPerson } from './actions';

export interface PersonLite {
  id: string;
  image_url: string;
  label: string | null;
}
export interface GarmentLite {
  id: string;
  image_url: string;
  category: string | null;
}

const POLL_MS = 2000;

interface GenStatus {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  result_url: string | null;
  error_message: string | null;
}

export default function Uploader({
  people,
  garments,
}: {
  people: PersonLite[];
  garments: GarmentLite[];
}) {
  const router = useRouter();

  // ---- upload forms ----
  const [personState, personAction, personPending] = useActionState(uploadPerson, { ok: false });
  const [garmentState, garmentAction, garmentPending] = useActionState(uploadGarment, { ok: false });
  const personFormRef = useRef<HTMLFormElement>(null);
  const garmentFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (personState.ok) {
      personFormRef.current?.reset();
      router.refresh();
    }
  }, [personState, router]);
  useEffect(() => {
    if (garmentState.ok) {
      garmentFormRef.current?.reset();
      router.refresh();
    }
  }, [garmentState, router]);

  // ---- compose + polling ----
  const [composeState, composeAction, composePending] = useActionState(compose, { ok: false });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<GenStatus | null>(null);

  useEffect(() => {
    if (composeState.ok && composeState.generation_id) {
      setActiveId(composeState.generation_id);
      setStatus(null);
    }
  }, [composeState]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/generations/${activeId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as GenStatus;
        if (cancelled) return;
        setStatus(data);
        if (data.status === 'done' || data.status === 'failed') {
          router.refresh();
          return; // stop polling
        }
        setTimeout(poll, POLL_MS);
      } catch {
        if (!cancelled) setTimeout(poll, POLL_MS);
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [activeId, router]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Upload person</h3>
        <form ref={personFormRef} action={personAction}>
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
          <input type="text" name="label" placeholder="label (optional)" style={{ marginLeft: 8 }} />
          <button type="submit" disabled={personPending} style={{ marginLeft: 8 }}>
            {personPending ? 'uploading…' : 'upload'}
          </button>
        </form>
        {personState.error && <p style={errorStyle}>{personState.error}</p>}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Upload garment</h3>
        <form ref={garmentFormRef} action={garmentAction}>
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
          <input type="text" name="category" placeholder="category (e.g. top)" style={{ marginLeft: 8 }} />
          <input type="text" name="note" placeholder="note (optional)" style={{ marginLeft: 8 }} />
          <button type="submit" disabled={garmentPending} style={{ marginLeft: 8 }}>
            {garmentPending ? 'uploading…' : 'upload'}
          </button>
        </form>
        {garmentState.error && <p style={errorStyle}>{garmentState.error}</p>}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Compose</h3>
        {people.length === 0 || garments.length === 0 ? (
          <p style={mutedStyle}>upload at least one person and one garment to compose.</p>
        ) : (
          <form action={composeAction}>
            <label>
              person:&nbsp;
              <select name="person_id" required defaultValue="">
                <option value="" disabled>— select —</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.label || p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            &nbsp;&nbsp;
            <label>
              garment:&nbsp;
              <select name="garment_id" required defaultValue="">
                <option value="" disabled>— select —</option>
                {garments.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.category || g.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={composePending} style={{ marginLeft: 12 }}>
              {composePending ? 'queuing…' : 'compose'}
            </button>
          </form>
        )}
        {composeState.error && <p style={errorStyle}>{composeState.error}</p>}

        {activeId && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0 }}>
              generation <code>{activeId.slice(0, 8)}</code>: <strong>{status?.status ?? 'queued'}</strong>
            </p>
            {status?.status === 'failed' && status.error_message && (
              <p style={errorStyle}>{status.error_message}</p>
            )}
            {status?.status === 'done' && status.result_url && (
              <img
                src={status.result_url}
                alt="result"
                style={{ marginTop: 8, maxWidth: '100%', maxHeight: 480 }}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const card: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 16,
};
const errorStyle: React.CSSProperties = { color: 'crimson', marginTop: 8 };
const mutedStyle: React.CSSProperties = { color: '#888', marginTop: 0 };
