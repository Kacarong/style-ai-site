import { db, getMeta } from '@/lib/db';
import { toProxyImageUrl } from '@/lib/image-url';
import { inferenceHealth } from '@/lib/inference';
import { deleteGarment, deletePerson } from './actions';
import DeletableGallery from './deletable-gallery';
import DownloadButton from './download-button';
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

const PROVIDER_LABEL: Record<string, string> = {
  mock: '테스트 모드 (mock)',
  fashn_vton_v15: '로컬 AI (FASHN VTON v1.5)',
  fal_kling: 'fal.ai (Kling VTON)',
};

export default async function Home() {
  const health = await inferenceHealth();
  const online = health.online;
  const providerLabel =
    health.provider !== null
      ? PROVIDER_LABEL[health.provider] ?? health.provider
      : null;
  const d = db();

  const people = d
    .prepare('SELECT id, image_url, label FROM people ORDER BY created_at DESC LIMIT 24')
    .all() as PersonLite[];
  const garments = d
    .prepare(
      'SELECT id, image_url, category FROM garments ORDER BY created_at DESC LIMIT 24',
    )
    .all() as GarmentLite[];
  const generations = d
    .prepare(
      'SELECT id, person_id, garment_id, result_url, status, error_message, created_at FROM generations ORDER BY created_at DESC LIMIT 24',
    )
    .all() as GenerationRow[];

  const hb = getMeta('worker_heartbeat_at');
  const hbAge = hb ? Date.now() - Number(hb.value) : null;
  const workerLive = hbAge !== null && hbAge < WORKER_STALE_MS;

  return (
    <main>
      <h1 className="site-title">단홍드</h1>
      <p className="muted site-subtitle">개인용 가상 피팅</p>

      <div className="badges">
        <Badge
          label="합성 서버"
          ok={online}
          okText={providerLabel ? `정상 · ${providerLabel}` : '정상'}
          badText="오프라인"
        />
        <Badge
          label="워커"
          ok={workerLive}
          okText={hbAge !== null ? `정상 (${(hbAge / 1000).toFixed(1)}초 전)` : '정상'}
          badText={hb ? `중단 (${((hbAge ?? 0) / 1000).toFixed(0)}초)` : '미실행'}
        />
      </div>

      {!online && (
        <div className="banner">
          합성 서버(inference)가 오프라인입니다. PC에서 uvicorn이 실행 중인지 확인하세요. 업로드와 합성이 실패합니다.
        </div>
      )}
      {online && !workerLive && (
        <div className="banner">
          워커(worker)가 실행 중이지 않습니다. <code>npm run worker</code>를 실행하세요. 큐에 쌓인 작업이 처리되지 않습니다.
        </div>
      )}

      <Uploader people={people} garments={garments} />

      <section>
        <h2>등록된 사람 ({people.length})</h2>
        <DeletableGallery
          items={people.map(p => ({
            id: p.id,
            url: toProxyImageUrl(p.image_url),
            label: p.label,
          }))}
          onDelete={deletePerson}
          emptyText="아직 없습니다."
        />
      </section>

      <section>
        <h2>등록된 옷 ({garments.length})</h2>
        <DeletableGallery
          items={garments.map(g => ({
            id: g.id,
            url: toProxyImageUrl(g.image_url),
            label: g.category,
          }))}
          onDelete={deleteGarment}
          emptyText="아직 없습니다."
        />
      </section>

      <section>
        <h2>합성 기록 ({generations.length})</h2>
        {generations.length === 0 ? (
          <p className="muted">아직 합성한 기록이 없습니다.</p>
        ) : (
          <ul className="gen-list">
            {generations.map(g => (
              <li key={g.id}>
                <code>{g.id.slice(0, 8)}</code>
                <StatusPill status={g.status} />
                {g.result_url && (
                  <>
                    {' '}
                    —{' '}
                    <a href={toProxyImageUrl(g.result_url)} target="_blank" rel="noreferrer">
                      결과 보기
                    </a>
                    <span style={{ marginLeft: 8 }}>
                      <DownloadButton
                        url={toProxyImageUrl(g.result_url)}
                        filename={`danhongd-${g.id.slice(0, 8)}.png`}
                        className="link-button"
                      >
                        저장
                      </DownloadButton>
                    </span>
                  </>
                )}
                {g.error_message && (
                  <span className="error" style={{ marginLeft: 6 }}>
                    — {g.error_message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Badge({
  label,
  ok,
  okText,
  badText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <span className={`badge ${ok ? 'ok' : 'bad'}`}>
      <span className="badge-dot" />
      {label}: {ok ? okText : badText}
    </span>
  );
}

function StatusPill({ status }: { status: 'queued' | 'running' | 'done' | 'failed' }) {
  const text = { queued: '대기', running: '처리중', done: '완료', failed: '실패' }[status];
  return <span className={`status-pill status-${status}`}>{text}</span>;
}
