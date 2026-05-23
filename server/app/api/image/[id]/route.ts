// Image proxy: browser -> Next.js -> inference.
// Hides the inference hostname from the browser so localhost/IPv6 quirks
// and STORAGE_PUBLIC_BASE_URL config don't matter.

import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const t = new URL(req.url).searchParams.get('t');
  if (!t) {
    return new Response('missing token', { status: 400 });
  }

  const upstreamUrl =
    `${env.INFERENCE_BASE_URL}/storage/${encodeURIComponent(id)}?t=${encodeURIComponent(t)}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { cache: 'no-store' });
  } catch (e) {
    return new Response(
      `inference unreachable: ${e instanceof Error ? e.message : String(e)}`,
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return new Response(await upstream.text(), { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'public, max-age=300',
    },
  });
}
