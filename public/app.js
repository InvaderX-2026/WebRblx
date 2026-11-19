const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { games: [], favorites: readStore('webrblx:favorites', []), recent: readStore('webrblx:recent', []), page: 'discover' };
function readStore(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(value) ? value : fallback; } catch { return fallback; } }
function saveStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('Browser storage is unavailable.'); } }
function toast(message) { const node = document.createElement('div'); node.className = 'toast'; node.textContent = message; $('#toastRegion').append(node); setTimeout(() => node.remove(), 3600); }
function safeText(value, fallback = '') { return typeof value === 'string' && value.trim() ? value : fallback; }
function formatPlayers(value) { return Number.isFinite(value) ? `${value.toLocaleString()} playing` : 'Experience'; }
function gameCard(game) {
  const article = document.createElement('article'); article.className = 'game-card';
  if (game.thumbnail) { const img = document.createElement('img'); img.className = 'game-thumb'; img.loading = 'lazy'; img.alt = ''; img.src = game.thumbnail; img.referrerPolicy = 'no-referrer'; article.append(img); }
  else { const placeholder = document.createElement('div'); placeholder.className = 'thumb-placeholder'; placeholder.textContent = '✦'; article.append(placeholder); }
  const info = document.createElement('div'); info.className = 'game-info';
  const name = document.createElement('div'); name.className = 'game-name'; name.textContent = safeText(game.name, 'Untitled experience');
  const meta = document.createElement('div'); meta.className = 'game-meta'; meta.textContent = `${safeText(game.creator, 'Roblox creator')} · ${formatPlayers(game.players)}`;
  const actions = document.createElement('div'); actions.className = 'game-actions';
  const play = document.createElement('button'); play.className = 'play-link'; play.type = 'button'; play.textContent = 'View experience →'; play.addEventListener('click', () => openGame(game));
  const favorite = document.createElement('button'); favorite.className = `favorite-button${state.favorites.some(item => item.placeId === game.placeId) ? ' saved' : ''}`; favorite.type = 'button'; favorite.setAttribute('aria-label', 'Toggle favorite'); favorite.textContent = state.favorites.some(item => item.placeId === game.placeId) ? '★' : '☆'; favorite.addEventListener('click', () => toggleFavorite(game, favorite));
  actions.append(play, favorite); info.append(name, meta, actions); article.append(info); return article;
}
function renderGames(target, games, emptyTitle, emptyText) {
  target.replaceChildren();
  if (!games.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; const icon = document.createElement('div'); icon.className = 'empty-icon'; icon.textContent = '✦'; const title = document.createElement('h3'); title.textContent = emptyTitle; const text = document.createElement('p'); text.textContent = emptyText; empty.append(icon, title, text); target.append(empty); return; }
  games.forEach(game => target.append(gameCard(game)));
}
function toggleFavorite(game, button) {
  const exists = state.favorites.some(item => item.placeId === game.placeId);
  state.favorites = exists ? state.favorites.filter(item => item.placeId !== game.placeId) : [game, ...state.favorites].slice(0, 100);
  saveStore('webrblx:favorites', state.favorites); button.classList.toggle('saved', !exists); button.textContent = exists ? '☆' : '★';
  if (state.page === 'favorites') renderGames($('#favoritesGrid'), state.favorites, 'No favorites yet', 'Save experiences from discovery to see them here.');
  toast(exists ? 'Removed from favorites.' : 'Added to favorites.');
}
function openGame(game) {
  state.recent = [game, ...state.recent.filter(item => item.placeId !== game.placeId)].slice(0, 30); saveStore('webrblx:recent', state.recent);
  location.href = `/roblox/?placeId=${encodeURIComponent(game.placeId)}`;
}
async function search(query) {
  const title = $('#resultsTitle'), count = $('#resultCount'), grid = $('#gameGrid');
  title.textContent = `Results for “${query}”`; count.textContent = 'Searching…';
  const loading = document.createElement('div'); loading.className = 'empty-state'; loading.textContent = 'Searching public Roblox experience data…'; grid.replaceChildren(loading);
  try {
    const response = await fetch(`/api/experiences/search?q=${encodeURIComponent(query)}&limit=24`, { headers: { accept: 'application/json' } });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Search failed.');
    state.games = payload.data || []; count.textContent = `${state.games.length} results`; renderGames(grid, state.games, 'No experiences found', 'Try another search term.');
  } catch (error) { count.textContent = ''; renderGames(grid, [], 'Could not load results', error.message || 'Please try again.'); }
}
function navigate(page) {
  state.page = page;
  const labels = { discover: 'Discover', friends: 'Friends', recent: 'Recently played', favorites: 'Favorites', account: 'Account' };
  $('#breadcrumbCurrent').textContent = labels[page] || 'Discover';
  $$('.nav-link[data-view]').forEach(link => link.classList.toggle('active', link.dataset.view === page));
  $$('.content[data-page]').forEach(section => { section.hidden = section.dataset.page !== page; });
  if (page === 'recent') renderGames($('#recentGrid'), state.recent, 'Nothing here yet', 'Experiences you open will appear here.');
  if (page === 'favorites') renderGames($('#favoritesGrid'), state.favorites, 'No favorites yet', 'Save experiences from discovery to see them here.');
  if (page === 'friends') $('#friendUserId').focus();
  if (page === 'account') document.querySelector('.profile-name').textContent = 'Guest';
  history.replaceState(null, '', `#${page}`); $('#sidebar').classList.remove('open'); window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function loadFriends(userId) {
  const results = $('#friendResults'); results.textContent = 'Loading public friend list and presence…';
  try {
    const [profileRes, friendsRes] = await Promise.all([fetch(`/api/users/${userId}`), fetch(`/api/users/${userId}/friends`)]);
    const profile = await profileRes.json(), friends = await friendsRes.json();
    if (!profileRes.ok) throw new Error(profile.error?.message || 'Could not load profile.');
    if (!friendsRes.ok) throw new Error(friends.error?.message || 'Could not load friends.');
    const list = (friends.data || []).slice(0, 50);
    let presenceById = new Map();
    if (list.length) {
      const presenceRes = await fetch('/api/presence', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ userIds: list.map(friend => String(friend.id)) }) });
      const presencePayload = await presenceRes.json();
      if (presenceRes.ok) presenceById = new Map((presencePayload.data || []).map(item => [String(item.userId), item]));
    }
    results.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = `${profile.data.displayName || profile.data.name}'s friends`; heading.style.font = '600 18px Space Grotesk';
    const count = document.createElement('p'); count.className = 'muted small'; count.textContent = `${friends.data.length} public friends · showing ${list.length}`; results.append(heading, count);
    list.forEach(friend => {
      const presence = presenceById.get(String(friend.id));
      const row = document.createElement('div'); row.className = 'friend-row';
      const avatar = document.createElement('div'); avatar.className = 'friend-avatar'; avatar.textContent = (friend.displayName || friend.name || '?').slice(0, 1).toUpperCase();
      const meta = document.createElement('div'); meta.className = 'friend-meta';
      const name = document.createElement('strong'); name.textContent = friend.displayName || friend.name;
      const handle = document.createElement('span'); handle.textContent = `@${friend.name} · ID ${friend.id}`;
      const status = document.createElement('span'); status.className = 'friend-presence';
      const types = ['Offline', 'Online', 'In a game', 'In Studio'];
      status.textContent = presence ? (types[presence.presenceType] || 'Status unavailable') : 'Presence unavailable';
      meta.append(name, handle, status); row.append(avatar, meta);
      if (presence?.joinable) {
        const join = document.createElement('button'); join.className = 'play-link friend-join'; join.type = 'button'; join.textContent = 'Join friend →';
        join.addEventListener('click', async () => {
          join.disabled = true; join.textContent = 'Preparing…';
          try {
            const response = await fetch(`/api/friends/${encodeURIComponent(friend.id)}/join`, { method: 'POST' });
            const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Could not prepare join.');
            window.open(payload.data.launchUrl, '_blank', 'noopener,noreferrer');
            join.textContent = 'Opened Roblox';
          } catch (error) { toast(error.message || 'Could not join friend.'); join.disabled = false; join.textContent = 'Join friend →'; }
        }); row.append(join);
      } else {
        const unavailable = document.createElement('span'); unavailable.className = 'muted small friend-unavailable'; unavailable.textContent = 'Not joinable'; row.append(unavailable);
      }
      results.append(row);
    });
    if (!list.length) { const empty = document.createElement('p'); empty.className = 'muted small'; empty.textContent = 'No public friends were returned for this profile.'; results.append(empty); }
  } catch (error) { results.textContent = error.message || 'Could not load friends.'; }
}
$('#searchForm').addEventListener('submit', event => { event.preventDefault(); const query = $('#searchInput').value.trim(); if (query.length >= 2) { navigate('discover'); search(query); } });
$$('.topic-chip').forEach(button => button.addEventListener('click', () => { $('#searchInput').value = button.dataset.query; search(button.dataset.query); }));
$('#heroSearchButton').addEventListener('click', event => { event.preventDefault(); $('#searchInput').focus(); $('#search').scrollIntoView({ behavior: 'smooth' }); });
$('#friendForm').addEventListener('submit', event => { event.preventDefault(); const id = $('#friendUserId').value.trim(); if (!/^[1-9]\d{0,18}$/.test(id)) return toast('Enter a valid numeric Roblox user ID.'); loadFriends(id); });
$$('[data-view]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); navigate(link.dataset.view); }));
$('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#themeButton').addEventListener('click', () => { document.body.classList.toggle('light'); try { localStorage.setItem('webrblx:theme', document.body.classList.contains('light') ? 'light' : 'dark'); } catch {} });
try { if (localStorage.getItem('webrblx:theme') === 'light') document.body.classList.add('light'); } catch {}
$('#year').textContent = new Date().getFullYear();
const initial = location.hash.slice(1); if (['discover', 'friends', 'recent', 'favorites', 'account'].includes(initial)) navigate(initial);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => {});
