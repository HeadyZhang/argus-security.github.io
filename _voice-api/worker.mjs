const MAX_BYTES = 2048;

async function readLimitedJson(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) throw new Error('size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let size = 0;
  const parts = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('size'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').includes(origin);
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin'
    };
    if (allowed) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (status, data, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });
    // This endpoint only accepts writes. There is no public list/export endpoint.
    if (url.pathname !== '/api/beta' || url.search) return reply(404, { error: 'not_found' });
    if (!allowed) return reply(403, { error: 'origin_not_allowed' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'
    } });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' });
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return reply(415, { error: 'json_required' });

    try {
      // Cloudflare supplies this header; client-provided email is never a rate-limit key.
      const key = `voice-beta:${request.headers.get('CF-Connecting-IP') || 'unknown'}`;
      const limit = await env.SIGNUP_LIMITER.limit({ key });
      if (!limit.success) return reply(429, { error: 'rate_limited' }, { 'Retry-After': '60' });
    } catch {
      return reply(503, { error: 'temporarily_unavailable' });
    }

    let payload;
    try { payload = await readLimitedJson(request); }
    catch (error) { return reply(error.message === 'size' ? 413 : 400, { error: 'invalid_request' }); }
    if (!payload || typeof payload.email !== 'string') return reply(400, { error: 'invalid_email' });
    const email = payload.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email)) return reply(400, { error: 'invalid_email' });

    try {
      const result = await env.DB.prepare('INSERT INTO beta_requests (email) VALUES (?) ON CONFLICT(email) DO NOTHING').bind(email).run();
      if (!result.success) return reply(503, { error: 'storage_unavailable' });
      if (result.meta.changes === 0) {
        // A retry is acknowledged only after confirming an existing durable row.
        const existing = await env.DB.prepare('SELECT id FROM beta_requests WHERE email = ?').bind(email).first();
        if (!existing) return reply(503, { error: 'storage_unavailable' });
      }
      return reply(200, { received: true });
    } catch {
      // Never log request bodies, email addresses, or database exception details.
      return reply(503, { error: 'storage_unavailable' });
    }
  }
};
