# WebRblx

**Discover experiences. Play your way.**

WebRblx is a browser-first Roblox discovery and launch companion from **InvaderX**. This 2.1 update introduces a custom gaming dashboard, public experience search, public profile/friend-list lookup, a documented Node.js API, and an app-shell service worker.

WebRblx is an independent community project. It is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

## What's new in this rebuild

- Original WebRblx visual identity: midnight UI, electric-blue accents, responsive sidebar, and custom wordmark.
- Discovery dashboard with public Roblox experience search, thumbnails, creator names, and player counts.
- Favorites and recently opened experiences stored locally in the user's browser.
- Public Roblox profile and friend-list lookup by numeric user ID.
- Public presence lookup for up to 50 users per request.
- Friend join handoff: when public presence exposes a joinable place/server, WebRblx creates an official Roblox launch URL.
- `/roblox/?placeId=<id>` launch handoff page that opens the official Roblox experience page.
- Node.js 20+ server with no Bun requirement and no runtime dependencies.
- JSON API, request validation, rate limiting, upstream timeouts, short-lived public-data cache, and security headers.
- Service worker for the WebRblx app shell only. It does not intercept Roblox traffic or cache API/authentication data.
- API reference and automated smoke test.

## Requirements

- Node.js 20.11 or newer
- Internet access for public Roblox discovery endpoints

## Run locally

```bash
npm start
```

Open <http://127.0.0.1:8080>.

For development with automatic restarts:

```bash
npm run dev
```

Run checks:

```bash
npm run check
npm test
```

Configuration is read from environment variables:

| Variable | Default | Description |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface to bind |
| `PORT` | `8080` | HTTP port |
| `NODE_ENV` | `development` | Set to `production` to suppress internal error details |

Copy `.env.example` as a reference; the server currently reads environment variables directly and does not require a dotenv package.

## Routes

| Route | Purpose |
|---|---|
| `/` | WebRblx discovery dashboard |
| `/roblox/?placeId=<id>` | Experience launch handoff |
| `/api/health` | Health check |
| `/api/experiences/search?q=<query>` | Search public experience data |
| `/api/experiences/:universeId` | Public experience metadata |
| `/api/users/:userId` | Public user profile |
| `/api/users/:userId/friends` | Public friend list |
| `/api/presence` | POST public presence lookup for up to 50 user IDs |
| `/api/friends/:userId/join` | POST; resolves a friend’s joinable presence and returns an official Roblox launch URL |
| `/docs/API.md` | API reference |

See [docs/API.md](docs/API.md) for parameters and examples.

## Friend features

This release can look up public profiles, public friend lists, and public presence through Roblox’s documented presence endpoint. If Roblox exposes a friend as playing and returns a valid place ID (and optionally a server instance ID), the Join friend action creates an official Roblox launch handoff. Friend privacy settings, API availability, regional restrictions, and Roblox changes can prevent this. The handoff does not guarantee access to a private or full server.

WebRblx does not ask users to enter Roblox passwords or paste `.ROBLOSECURITY` cookies. Do not add password collection, session-cookie scraping, or browser-storage extraction. Use Roblox's official sign-in and game-launch experiences for account actions.

## Browser play and `/roblox/`

The `/roblox/` route validates the place and optional server ID, then hands off to Roblox’s official game-start URL. It also links to the official experience page. This release does **not** bundle or reimplement Roblox’s proprietary client. Roblox announced Web Play early access for creators to test their own experiences in Chrome; general availability and third-party embedding are not guaranteed. See the [Roblox Creator Hub OAuth reference](https://create.roblox.com/docs/cloud/auth/oauth2-reference) for supported identity integrations and Roblox’s [Web Play announcement](https://devforum.roblox.com/t/creators-can-test-games-on-the-web/4964592) for the current early-access scope. WebRblx therefore relies on Roblox to decide whether browser play is available for a given account and experience.

## Service worker

`public/sw.js` caches only the static WebRblx application shell. It deliberately bypasses `/api/` and does not proxy Roblox requests, inspect browser cookies, or store authentication data.

## Security notes

- Do not deploy the development server directly to the public internet without TLS, a reverse proxy, monitoring, and stricter production rate limiting.
- Keep the server bound to localhost behind a properly configured reverse proxy when possible.
- Never log passwords, session cookies, access tokens, or authorization headers.
- Public Roblox endpoints can change or rate-limit requests; handle API errors gracefully.
- Review Roblox's current terms and developer documentation before adding account, presence, or game-runtime integrations.

## Project structure

```text
WebRblx/
├── docs/
│   └── API.md
├── integrations/
│   └── roblox-auth.js
├── public/
│   ├── assets/icon.svg
│   ├── roblox/index.html
│   ├── app.js
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── styles.css
│   └── sw.js
├── tests/api.test.js
├── .env.example
├── .gitignore
├── package.json
└── server.js
```

## Credits and rights

WebRblx's UI and Node.js API in this rebuild are newly authored for this project. Roblox names, game data, and any Roblox-operated services remain the property of their respective owners. Experience metadata and thumbnails are retrieved from public Roblox endpoints at request time; they are not bundled with this repository. Check Roblox's current terms before production use.

## Roadmap

- [x] Custom WebRblx identity and responsive gaming dashboard
- [x] Public experience search and thumbnails
- [x] Favorites and recently opened experiences
- [x] Public profile and friend-list lookup
- [x] Node.js API and API documentation
- [x] Service worker app-shell caching
- [ ] Roblox-supported sign-in integration, if available for this use case
- [x] Public friend presence lookup and official Roblox join handoff
- [ ] Official Roblox Web Play integration if Roblox publishes a supported third-party integration path
- [ ] Production deployment guide, telemetry, and accessibility audit

---

flowchart LR
  U[User Browser] --> UI[WebRblx UI<br/>HTML + CSS + JavaScript]

  UI --> L[Game Launcher<br/>/play?placeId=ID]

  L --> E[Browser Client<br/>WebAssembly + workers]

  E -- Roblox requests --> SW[sw.js<br/>Service Worker]

  SW -- postMessage --> H[host.js<br/>Browser networking]

  H -- HTTPS transport --> W[Wisp server<br/>/wisp/]

  W --> R[Roblox HTTPS APIs]

  E -- WebTransport, direct --> Q[Roblox game servers]

  UI --> F[Friends API<br/>Presence lookup]

  F --> P[Roblox Presence API]

  P --> F

  F -- Join friend --> L

  UI --> N[Node.js Backend<br/>Express API]

  N --> API[WebRblx API Routes]

**WebRblx 2.1.0 · An InvaderX project**
