'use client';

import { useState } from 'react';

/**
 * Force-download a same-origin image. Using <a download="..."> alone is
 * unreliable across browsers (Safari often ignores it for inline-renderable
 * MIME types). Fetching to a Blob and clicking a synthetic anchor works
 * everywhere.
 */
export default function DownloadButton({
  url,
  filename,
  className = 'primary',
  children = '사진 저장',
}: {
  url: string;
  filename: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleClick() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the click has been dispatched so the download starts first.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleClick}
        disabled={busy}
      >
        {busy ? '저장 중…' : children}
      </button>
      {err && <span className="error" style={{ marginLeft: 8 }}>{err}</span>}
    </>
  );
}
