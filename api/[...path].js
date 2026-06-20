// Vercel Edge Function — FIFA Bracket Challenge proxy
// Secrets set in Vercel dashboard: JSONBIN_KEY, ADMIN_PASSWORD_HASH

export const config = { runtime: 'edge' };

const JSONBIN_ID = '6a2b9661f5f4af5e29e4485c';
const API_BASE   = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}`;

const ALLOWED_ORIGINS = ['https://kanakamteja.github.io'];

function corsHeaders(origin) {
  const o = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
    'Access-Control-Max-Age': '86400',
  };
}

async function jbFetch(path, method, body) {
  return fetch(API_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': process.env.JSONBIN_KEY,
      'X-Bin-Versioning': 'false',
    },
    body,
  });
}

export default async function handler(request) {
  const origin = request.headers.get('Origin') || ALLOWED_ORIGINS[0];
  const ch = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: ch });
  }

  // Strip the /api prefix Vercel adds; pathname becomes /data or /data/{key}
  const pathname = new URL(request.url).pathname.replace(/^\/api/, '');

  // GET /data — return full bin record
  if (request.method === 'GET' && pathname === '/data') {
    const r = await jbFetch('/latest', 'GET', undefined);
    if (!r.ok) return new Response('Upstream error ' + r.status, { status: 502, headers: ch });
    const { record } = await r.json();
    return new Response(JSON.stringify(record || {}), {
      headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // PUT /data/{key} — update one key
  if (request.method === 'PUT' && pathname.startsWith('/data/')) {
    const key = decodeURIComponent(pathname.slice(6));

    if (!key.startsWith('entry:') && key !== 'adminResults') {
      return new Response('Forbidden key', { status: 403, headers: ch });
    }

    if (key === 'adminResults') {
      const pwHash = request.headers.get('X-Admin-Password') || '';
      if (!process.env.ADMIN_PASSWORD_HASH || pwHash !== process.env.ADMIN_PASSWORD_HASH) {
        return new Response('Unauthorized', { status: 401, headers: ch });
      }
    }

    let value;
    try { value = await request.json(); }
    catch { return new Response('Invalid JSON body', { status: 400, headers: ch }); }

    const readResp = await jbFetch('/latest', 'GET', undefined);
    if (!readResp.ok) return new Response('Upstream read error', { status: 502, headers: ch });
    const { record: current } = await readResp.json();
    const updated = { ...(current || {}), [key]: value };

    const writeResp = await jbFetch('', 'PUT', JSON.stringify(updated));
    if (!writeResp.ok) return new Response('Upstream write error', { status: 502, headers: ch });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...ch, 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not found', { status: 404, headers: ch });
}
