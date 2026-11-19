const params = new URLSearchParams(location.search);
const id = params.get('placeId');
const serverId = params.get('gameInstanceId');
const valid = Boolean(id && /^[1-9]\d{0,18}$/.test(id));
const validServer = Boolean(serverId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serverId));
const title = document.querySelector('#title');
const place = document.querySelector('#placeId');
const link = document.querySelector('#officialLink');
const experienceLink = document.querySelector('#experienceLink');
if (valid) {
  place.textContent = `Place ID: ${id}${validServer ? ' · Friend server selected' : ''}`;
  const start = new URL('https://www.roblox.com/games/start');
  start.searchParams.set('placeId', id);
  if (validServer) start.searchParams.set('gameInstanceId', serverId);
  link.href = start.toString();
  experienceLink.href = `https://www.roblox.com/games/${encodeURIComponent(id)}/`;
  title.textContent = validServer ? 'Your friend’s server is ready' : 'Your experience is ready';
} else {
  place.textContent = 'Invalid or missing place ID';
  link.hidden = true;
  experienceLink.hidden = true;
}
