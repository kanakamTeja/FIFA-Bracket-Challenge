// GET /api/data — return full bin record (public read)
export const config = { runtime: 'edge' };

const JSONBIN_ID = '6a2b9661f5f4af5e29e4485c';
const API_BASE   = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}`;
const ALLOWED_ORIGINS = ['https://kanakamteja.github.io'];

function corsHeaders(origin) {
  const o = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default async function handler(request) {
  const origin = request.headers.get('Origin') || ALLOWED_ORIGINS[0];
  const ch = corsHeaders(origin);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });

  if (request.method === 'GET') {
    const r = await fetch(API_BASE + '/latest', {
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_KEY,
        'X-Bin-Versioning': 'false',
      },
    });
    if (!r.ok) return new Response('Upstream error ' + r.status, { status: 502, headers: ch });
    const { record } = await r.json();
    return new Response(JSON.stringify(record || {}), {
      headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  return new Response('Method not allowed', { status: 405, headers: ch });
}
