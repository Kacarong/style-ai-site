'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { toProxyImageUrl } from '@/lib/image-url';
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
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
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
          return;
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

  const canCompose = selectedPersonId !== null && selectedGarmentId !== null;

  return (
    <div className="stack">
      <section className="card">
        <h3>사람 사진 업로드</h3>
        <form ref={personFormRef} action={personAction}>
          <div className="row">
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
            <input type="text" name="label" placeholder="이름표 (선택)" />
            <button type="submit" className="primary" disabled={personPending}>
              {personPending ? '업로드 중…' : '업로드'}
            </button>
          </div>
        </form>
        {personState.error && <p className="error">{personState.error}</p>}
      </section>

      <section className="card">
        <h3>옷 사진 업로드</h3>
        <form ref={garmentFormRef} action={garmentAction}>
          <div className="row">
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
            <input type="text" name="category" placeholder="카테고리 (예: 상의)" />
            <input type="text" name="note" placeholder="메모 (선택)" />
            <button type="submit" className="primary" disabled={garmentPending}>
              {garmentPending ? '업로드 중…' : '업로드'}
            </button>
          </div>
        </form>
        {garmentState.error && <p className="error">{garmentState.error}</p>}
      </section>

      <section className="card">
        <h3>합성하기</h3>
        {people.length === 0 || garments.length === 0 ? (
          <p className="muted">사람 사진과 옷 사진을 각각 1장 이상 먼저 올려주세요.</p>
        ) : (
          <form action={composeAction}>
            <input type="hidden" name="person_id" value={selectedPersonId ?? ''} />
            <input type="hidden" name="garment_id" value={selectedGarmentId ?? ''} />

            <div style={{ marginBottom: 16 }}>
              <div className="picker-label">사람 선택</div>
              <CardPicker
                items={people.map(p => ({
                  id: p.id,
                  url: toProxyImageUrl(p.image_url),
                  label: p.label,
                }))}
                selectedId={selectedPersonId}
                onSelect={setSelectedPersonId}
                emptyText="등록된 사람 없음"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="picker-label">옷 선택</div>
              <CardPicker
                items={garments.map(g => ({
                  id: g.id,
                  url: toProxyImageUrl(g.image_url),
                  label: g.category,
                }))}
                selectedId={selectedGarmentId}
                onSelect={setSelectedGarmentId}
                emptyText="등록된 옷 없음"
              />
            </div>

            <button type="submit" className="primary" disabled={composePending || !canCompose}>
              {composePending ? '대기열에 추가 중…' : '합성 시작'}
            </button>
          </form>
        )}
        {composeState.error && <p className="error">{composeState.error}</p>}

        {activeId && (
          <div className="gen-status">
            <p>
              합성 작업 <code>{activeId.slice(0, 8)}</code>
              <StatusPill status={status?.status ?? 'queued'} />
            </p>
            {status?.status === 'failed' && status.error_message && (
              <p className="error">{status.error_message}</p>
            )}
            {status?.status === 'done' && status.result_url && (
              <img src={toProxyImageUrl(status.result_url)} alt="합성 결과" />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function CardPicker({
  items,
  selectedId,
  onSelect,
  emptyText,
}: {
  items: Array<{ id: string; url: string; label: string | null }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyText: string;
}) {
  if (items.length === 0) return <p className="picker-empty">{emptyText}</p>;
  return (
    <div className="picker-grid">
      {items.map(it => (
        <button
          type="button"
          key={it.id}
          className={`picker-card ${selectedId === it.id ? 'selected' : ''}`}
          onClick={() => onSelect(it.id)}
          aria-pressed={selectedId === it.id}
        >
          <img src={it.url} alt={it.label ?? ''} />
          <div className="picker-card-label">{it.label || '(이름 없음)'}</div>
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: 'queued' | 'running' | 'done' | 'failed' }) {
  const text = { queued: '대기', running: '처리중', done: '완료', failed: '실패' }[status];
  return <span className={`status-pill status-${status}`}>{text}</span>;
}
