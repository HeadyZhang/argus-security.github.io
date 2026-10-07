import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = {
    ALLOWED_ORIGINS: 'https://argus-security.dev',
    SIGNUP_LIMITER: { limit: async () => ({ success: true }) },
    DB: { prepare(sql) { return { bind(...args) { return {
      async run() { const info = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: info.changes } }; },
      async first() { return sqlite.prepare(sql).get(...args); }
    }; } }; } }
  };
  function send(data, options = {}) {
    return worker.fetch(new Request('https://signup.example/api/beta', {
      method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, 'Content-Type': 'application/json', ...options.headers },
      body: typeof data === 'string' ? data : JSON.stringify(data)
    }), env);
  }
  return { sqlite, env, send };
}

test('receipt follows a real insert; retries and case variants do not duplicate', async () => {
  const { sqlite, send } = fixture();
  try {
    assert.deepEqual(await (await send({ email: '  Example@Example.com ' })).json(), { received: true });
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM beta_requests').get().n, 1);
    const row = sqlite.prepare('SELECT * FROM beta_requests').get();
    assert.equal(row.email, 'example@example.com'); assert.ok(row.created_at);
    assert.deepEqual(await (await send({ email: 'example@example.com' })).json(), { received: true });
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM beta_requests').get().n, 1);
  } finally { sqlite.close(); }
});

test('invalid, missing, oversized, and malformed input cannot be saved', async () => {
  const { sqlite, send } = fixture();
  try {
    for (const payload of [{}, null, { email: 4 }, { email: 'no-at' }, { email: 'a@b' }, { email: 'a\n@b.com' }, { email: 'a'.repeat(245) + '@example.com' }, '{']) {
      assert.equal((await send(payload)).status, 400);
    }
    assert.equal((await send({ email: 'a@example.com', extra: 'x'.repeat(2048) })).status, 413);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM beta_requests').get().n, 0);
  } finally { sqlite.close(); }
});

test('origin and content type are restricted; submissions cannot be read publicly', async () => {
  const { sqlite, env, send } = fixture();
  try {
    const blocked = await send({ email: 'x@example.com' }, { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(blocked.status, 403); assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal((await send({ email: 'x@example.com' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
    const read = await worker.fetch(new Request('https://signup.example/api/beta', { headers: { Origin: env.ALLOWED_ORIGINS } }), env);
    assert.equal(read.status, 405);
    const preflight = await worker.fetch(new Request('https://signup.example/api/beta', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGINS } }), env);
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGINS);
  } finally { sqlite.close(); }
});

test('rate limit and database failures never claim a successful receipt', async () => {
  const { sqlite, env, send } = fixture();
  try {
    env.SIGNUP_LIMITER.limit = async () => ({ success: false });
    const limited = await send({ email: 'x@example.com' }); assert.equal(limited.status, 429); assert.equal(limited.headers.get('Retry-After'), '60');
    env.SIGNUP_LIMITER.limit = async () => ({ success: true });
    env.DB.prepare = () => { throw new Error('database unavailable'); };
    const failed = await send({ email: 'x@example.com' }); assert.equal(failed.status, 503); assert.equal((await failed.json()).received, undefined);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM beta_requests').get().n, 0);
  } finally { sqlite.close(); }
});
