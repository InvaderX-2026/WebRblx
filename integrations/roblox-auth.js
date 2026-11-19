/**
 * Public Roblox presence adapter.
 * This uses Roblox's documented public presence endpoint (no pasted session
 * cookies or passwords). Availability and response fields are controlled by Roblox.
 */
const ID = /^[1-9]\d{0,18}$/;
const GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPresence(userIds) {
  if (!Array.isArray(userIds) || userIds.length < 1 || userIds.length > 50 || userIds.some(id => !ID.test(String(id)))) {
    const error = new Error('Provide between 1 and 50 valid Roblox user IDs.');
    error.status = 400;
    error.code = 'invalid_user_ids';
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch('https://presence.roblox.com/v1/presence/users', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'WebRblx/2.1' },
      body: JSON.stringify({ userIds: userIds.map(Number) }),
      signal: controller.signal,
    });
    if (response.status === 429) {
      const error = new Error('Roblox presence is rate-limiting requests. Try again shortly.');
      error.status = 503; error.code = 'upstream_rate_limited'; throw error;
    }
    if (!response.ok) {
      const error = new Error(`Roblox presence returned HTTP ${response.status}.`);
      error.status = 502; error.code = 'presence_unavailable'; throw error;
    }
    const payload = await response.json();
    const entries = Array.isArray(payload.userPresences) ? payload.userPresences : [];
    return entries.map(item => {
      const userId = String(item.userId ?? '');
      const placeId = item.placeId == null ? null : String(item.placeId);
      const rawGameId = typeof item.gameId === 'string' ? item.gameId : '';
      return {
        userId,
        presenceType: Number(item.userPresenceType ?? 0),
        lastLocation: typeof item.lastLocation === 'string' ? item.lastLocation : '',
        placeId: placeId && ID.test(placeId) ? placeId : null,
        gameInstanceId: GAME_ID.test(rawGameId) ? rawGameId : null,
        joinable: Number(item.userPresenceType) === 2 && Boolean(placeId && ID.test(placeId)),
      };
    });
  } catch (error) {
    if (error.status) throw error;
    const wrapped = new Error('Could not retrieve Roblox presence.');
    wrapped.status = 502; wrapped.code = 'presence_unavailable'; throw wrapped;
  } finally { clearTimeout(timer); }
}

export async function getFriendPresence({ friendId }) {
  const [presence] = await getPresence([String(friendId)]);
  if (!presence || !presence.joinable) return null;
  return { placeId: presence.placeId, gameInstanceId: presence.gameInstanceId || undefined };
}
