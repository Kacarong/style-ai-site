'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export interface DeletableItem {
  id: string;
  url: string;
  label: string | null;
}

interface DeleteResult {
  ok: boolean;
  error?: string;
}

export default function DeletableGallery({
  items,
  onDelete,
  emptyText,
}: {
  items: DeletableItem[];
  onDelete: (id: string) => Promise<DeleteResult>;
  emptyText: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (items.length === 0) return <p className="muted">{emptyText}</p>;

  function handleDelete(id: string, label: string | null) {
    const name = label || id.slice(0, 8);
    if (
      !confirm(
        `"${name}" 사진을 삭제할까요?\n이 사진이 쓰인 합성 기록도 함께 삭제됩니다.`,
      )
    )
      return;
    setErrorMsg(null);
    setPendingId(id);
    startTransition(async () => {
      const res = await onDelete(id);
      setPendingId(null);
      if (!res.ok) {
        setErrorMsg(res.error ?? '삭제 실패');
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="gallery">
        {items.map(it => {
          const isPending = pending && pendingId === it.id;
          return (
            <figure key={it.id} className="gallery-item">
              <img src={it.url} alt={it.label ?? ''} />
              <figcaption>{it.label ?? it.id.slice(0, 8)}</figcaption>
              <button
                type="button"
                className="gallery-delete"
                onClick={() => handleDelete(it.id, it.label)}
                disabled={isPending}
                aria-label="삭제"
                title="삭제"
              >
                {isPending ? '…' : '×'}
              </button>
            </figure>
          );
        })}
      </div>
      {errorMsg && <p className="error">{errorMsg}</p>}
    </>
  );
}
