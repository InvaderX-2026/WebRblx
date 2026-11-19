import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFriendPresence, getPresence } from './integrations/roblox-auth.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_BODY = 16 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 90;
const cache = new Map();
const hits = new Map();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message, code = 'request_error') { super(message); this.status = status; this.code = code; }
}

function json(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...extra,
  });
  res.end(body);
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self' https://apis.roblox.com https://games.roblox.com https://thumbnails.roblox.com https://users.roblox.com https://friends.roblox.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}

function rateLimit(req) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const item = hits.get(key);
  if (!item || now - item.start >= RATE_WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    return;
  }
  item.count += 1;
  if (item.count > RATE_MAX) throw new HttpError(429, 'Too many requests. Please wait a moment.', 'rate_limited');
}

function validId(value) { return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value); }
function boundedInt(value, fallback, min, max) {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

async function readJson(url, ttlMs = 30_000) {
  const key = String(url);
  const previous = cache.get(key);
  if (previous && previous.expires > Date.now()) return previous.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9_000);
  try {
    const response = await fetch(key, {
      headers: { accept: 'application/json', 'user-agent': 'WebRblx/2.0 (+https://invaderx.example)' },
      signal: controller.signal,
    });
    if (response.status === 429) throw new HttpError(503, 'Roblox is temporarily rate-limiting requests. Try again shortly.', 'upstream_rate_limited');
    if (!response.ok) throw new HttpError(502, `Roblox returned HTTP ${response.status}.`, 'upstream_error');
    const value = await response.json();
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Could not reach the Roblox public API. Please try again.', 'upstream_unavailable');
  } finally { clearTimeout(timer); }
}

async function searchGames(query, limit) {
  const url = new URL('https://apis.roblox.com/search-api/omni-search');
  url.search = new URLSearchParams({ searchQuery: query, sessionId: crypto.randomUUID(), pageType: 'all' }).toString();
  const result = await readJson(url, 20_000);
  const games = (result.searchResults || [])
    .filter(group => group.contentGroupType === 'Game')
    .flatMap(group => group.contents || [])
    .filter(game => game.rootPlaceId && game.universeId)
    .slice(0, limit);
  if (!games.length) return [];
  const ids = games.map(game => game.universeId).join(',');
  const thumbsUrl = new URL('https://thumbnails.roblox.com/v1/games/icons');
  thumbsUrl.search = new URLSearchParams({ universeIds: ids, size: '512x512', format: 'Png', isCircular: 'false' }).toString();
  let thumbs = { data: [] };
  try { thumbs = await readJson(thumbsUrl, 60_000); } catch { /* Cards still render without thumbnails. */ }
  const images = new Map((thumbs.data || []).map(item => [String(item.targetId), item.imageUrl]));
  return games.map(game => ({
    placeId: String(game.rootPlaceId), universeId: String(game.universeId),
    name: String(game.name || 'Untitled experience'), creator: String(game.creatorName || game.creator?.name || 'Roblox creator'),
    players: Number.isFinite(game.playerCount) ? game.playerCount : null,
    description: String(game.description || ''), thumbnail: images.get(String(game.universeId)) || null,
  }));
}

async function readRequestJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body too large.', 'body_too_large');
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json'); }
}

async function api(req, res, url) {
  const path = url.pathname;
  if (req.method === 'GET' && path === '/api/health') {
    return json(res, 200, { ok: true, name: 'WebRblx API', version: '2.1.0', timestamp: new Date().toISOString(), capabilities: { publicPresence: true, friendJoinHandoff: true, independentRobloxRuntime: false } });
  }
  if (req.method === 'GET' && path === '/api/experiences/search') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) throw new HttpError(400, 'Search query must contain at least 2 characters.', 'invalid_query');
    const limit = boundedInt(url.searchParams.get('limit'), 18, 1, 30);
    return json(res, 200, { data: await searchGames(q, limit) });
  }
  const gameMatch = path.match(/^\/api\/experiences\/(\d+)$/);
  if (req.method === 'GET' && gameMatch) {
    const universeId = gameMatch[1];
    if (!validId(universeId)) throw new HttpError(400, 'Invalid universe ID.', 'invalid_id');
    const detailUrl = new URL('https://games.roblox.com/v1/games');
    detailUrl.searchParams.set('universeIds', universeId);
    const data = await readJson(detailUrl);
    const game = data.data?.[0];
    if (!game) throw new HttpError(404, 'Experience not found.', 'not_found');
    return json(res, 200, { data: game });
  }
  const userMatch = path.match(/^\/api\/users\/(\d+)$/);
  if (req.method === 'GET' && userMatch) {
    const userId = userMatch[1];
    if (!validId(userId)) throw new HttpError(400, 'Invalid user ID.', 'invalid_id');
    const data = await readJson(`https://users.roblox.com/v1/users/${userId}`, 60_000);
    return json(res, 200, { data });
  }
  const friendsMatch = path.match(/^\/api\/users\/(\d+)\/friends$/);
  if (req.method === 'GET' && friendsMatch) {
    const userId = friendsMatch[1];
    if (!validId(userId)) throw new HttpError(400, 'Invalid user ID.', 'invalid_id');
    const data = await readJson(`https://friends.roblox.com/v1/users/${userId}/friends`, 60_000);
    return json(res, 200, { data: data.data || [] });
  }
  if (req.method === 'POST' && path === '/api/presence') {
    const body = await readRequestJson(req);
    const userIds = Array.isArray(body.userIds) ? body.userIds.map(String) : [];
    if (userIds.length < 1 || userIds.length > 50 || userIds.some(id => !validId(id))) {
      throw new HttpError(400, 'Provide between 1 and 50 valid Roblox user IDs.', 'invalid_user_ids');
    }
    return json(res, 200, { data: await getPresence(userIds) });
  }
  const presenceMatch = path.match(/^\/api\/friends\/(\d+)\/join$/);
  if (req.method === 'POST' && presenceMatch) {
    const friendId = presenceMatch[1];
    if (!validId(friendId)) throw new HttpError(400, 'Invalid friend user ID.', 'invalid_id');
    const presence = await getFriendPresence({ friendId });
    if (!presence?.placeId) throw new HttpError(409, 'This friend is not currently in a joinable experience. They may be offline, have joining disabled, or Roblox may not expose their server.', 'friend_not_joinable');
    const launch = new URL('https://www.roblox.com/games/start');
    launch.searchParams.set('placeId', String(presence.placeId));
    if (presence.gameInstanceId) launch.searchParams.set('gameInstanceId', String(presence.gameInstanceId));
    return json(res, 200, { data: { placeId: presence.placeId, gameInstanceId: presence.gameInstanceId || null, launchUrl: launch.toString(), handoff: 'official-roblox' } });
  }
  throw new HttpError(404, 'API route not found.', 'not_found');
}

async function staticFile(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Invalid URL path.', 'bad_path'); }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const normalized = normalize(relative);
  if (normalized.startsWith('..') || normalized.includes(`..${sep}`)) throw new HttpError(403, 'Forbidden.', 'forbidden');
  let file = resolve(PUBLIC, normalized);
  if (file !== PUBLIC && !file.startsWith(`${PUBLIC}${sep}`)) throw new HttpError(403, 'Forbidden.', 'forbidden');
  let info;
  try { info = await stat(file); } catch { throw new HttpError(404, 'Page not found.', 'not_found'); }
  if (info.isDirectory()) { file = join(file, 'index.html'); try { info = await stat(file); } catch { throw new HttpError(404, 'Page not found.', 'not_found'); } }
  if (!info.isFile()) throw new HttpError(404, 'Page not found.', 'not_found');
  const body = await readFile(file);
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = createServer(async (req, res) => {
  securityHeaders(res);
  try {
    rateLimit(req);
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Method not allowed.', 'method_not_allowed');
      return await api(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.', 'method_not_allowed');
    if (url.pathname === '/roblox') return res.writeHead(308, { location: `/roblox/${url.search}` }).end();
    return await staticFile(req, res, url.pathname);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    if (status >= 500 && !IS_PROD) console.error(error);
    if (!res.headersSent) json(res, status, { error: { code: error.code || 'internal_error', message: status === 500 && IS_PROD ? 'Unexpected server error.' : message } });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => console.log(`[WebRblx] running at http://${HOST}:${PORT}`));

function shutdown() { server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
