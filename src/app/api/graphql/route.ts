import { randomUUID } from 'node:crypto';
import { HeaderMap } from '@apollo/server';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { Service } from '@/lib/service';
import { contextFor, createApi } from '@/lib/graphql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const api = createApi();
const started = api.start();
export async function POST(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return NextResponse.json({ error: 'Use application/json.' }, { status: 415 });
  const origin = request.headers.get('origin');
  // Next may normalize its internal URL to localhost; Host is the browser-facing authority.
  const expectedOrigin =
    process.env.APP_ORIGIN || `${request.nextUrl.protocol}//${request.headers.get('host')}`;
  if (origin && origin !== expectedOrigin)
    return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 16000)
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const cookie = request.cookies.get('atelier-workspace')?.value;
  const workspace =
    cookie && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cookie)
      ? cookie
      : randomUUID();
  const requested = request.headers.get('x-demo-role');
  const role = requested === 'VIEWER' ? 'VIEWER' : requested === 'MEMBER' ? 'MEMBER' : 'OWNER';
  const service = new Service(await getDatabase());
  await service.initialize(workspace);
  await started;
  const headers = new HeaderMap();
  request.headers.forEach((v, k) => headers.set(k, v));
  const result = await api.executeHTTPGraphQLRequest({
    httpGraphQLRequest: { method: 'POST', headers, search: '', body },
    context: async () => contextFor(service, workspace, role),
  });
  if (result.body.kind !== 'complete')
    return NextResponse.json({ error: 'Streaming is not supported.' }, { status: 400 });
  const response = new NextResponse(result.body.string, {
    status: result.status ?? 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  response.cookies.set('atelier-workspace', workspace, {
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 604800,
  });
  return response;
}
