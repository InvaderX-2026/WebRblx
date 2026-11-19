import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = 18080 + Math.floor(Math.random() * 1000);
let child;
let base;

test('WebRblx HTTP server exposes health and rejects unknown routes', async t => {
  child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, stdio: 'ignore' });
  base = `http://127.0.0.1:${port}`;
  t.after(() => child?.kill('SIGTERM'));
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.equal(ready, true, 'server should start');
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.version, '2.1.0');
  assert.equal(health.capabilities.friendJoinHandoff, true);
  const missing = await fetch(`${base}/api/no-such-route`);
  assert.equal(missing.status, 404);
  const invalid = await fetch(`${base}/api/experiences/search?q=x`);
  assert.equal(invalid.status, 400);
  const launchPage = await fetch(`${base}/roblox/?placeId=12345`);
  assert.equal(launchPage.status, 200);
  assert.match(await launchPage.text(), /Experience Launch/i);
  const invalidPresence = await fetch(`${base}/api/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userIds: ['abc'] }) });
  assert.equal(invalidPresence.status, 400);
  const invalidJoin = await fetch(`${base}/api/friends/abc/join`, { method: 'POST' });
  assert.equal(invalidJoin.status, 404);
});
