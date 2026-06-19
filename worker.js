// Cloudflare Worker — FIFA Bracket Challenge proxy
// Holds the JSONBin master key as a Worker secret so it never reaches the browser.
//
// Allowed operations:
//   GET  /data          — read all entries (public)
//   PUT  /data/entry:*  — write one participant entry (public, key-scoped)
//   PUT  /data/adminResults — write match results (requires X-Admin-Password header)
//   Everything else → 403 / 404

const JSONBIN_ID = '6a2b9661f5f4af5e29e4485c';
const API_BASE   = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}`;

const ALLOWED_ORIGINS = [
  'https://kanakamteja.github.io',
];

function corsHeaders(origin) {
  const o = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
    'Access-Control-Max-Age': '86400',
  };
}

async function jbFetch(path, method, body, masterKey) {
  return fetch(API_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': masterKey,
      'X-Bin-Versioning': 'false',
    },
    body,
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ALLOWED_ORIGINS[0];
    const ch = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: ch });
    }

    const { pathname } = new URL(request.url);

    // ── GET /data ── return full bin record ───────────────────────
    if (request.method === 'GET' && pathname === '/data') {
      const r = await jbFetch('/latest', 'GET', undefined, env.JSONBIN_KEY);
      if (!r.ok) {
        return new Response('Upstream error ' + r.status, { status: 502, headers: ch });
      }
      const { record } = await r.json();
      return new Response(JSON.stringify(record || {}), {
        headers: { ...ch, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // ── PUT /data/{key} ── update one key in the bin ──────────────
    if (request.method === 'PUT' && pathname.startsWith('/data/')) {
      const key = decodeURIComponent(pathname.slice(6));

      // Strict allowlist — blocks any attempt to bulk-overwrite the whole bin
      if (!key.startsWith('entry:') && key !== 'adminResults') {
        return new Response('Forbidden key', { status: 403, headers: ch });
      }

      // adminResults updates require the admin password hash
      if (key === 'adminResults') {
        const pwHash = request.headers.get('X-Admin-Password') || '';
        if (!env.ADMIN_PASSWORD_HASH || pwHash !== env.ADMIN_PASSWORD_HASH) {
          return new Response('Unauthorized', { status: 401, headers: ch });
        }
      }

      let value;
      try { value = await request.json(); }
      catch { return new Response('Invalid JSON body', { status: 400, headers: ch }); }

      // Read the current bin state, patch the single key, write back
      const readResp = await jbFetch('/latest', 'GET', undefined, env.JSONBIN_KEY);
      if (!readResp.ok) {
        return new Response('Upstream read error ' + readResp.status, { status: 502, headers: ch });
      }
      const { record: current } = await readResp.json();
      const updated = { ...(current || {}), [key]: value };

      const writeResp = await jbFetch('', 'PUT', JSON.stringify(updated), env.JSONBIN_KEY);
      if (!writeResp.ok) {
        return new Response('Upstream write error ' + writeResp.status, { status: 502, headers: ch });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...ch, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404, headers: ch });
  },
};
