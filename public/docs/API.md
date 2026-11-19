# WebRblx API reference

Base URL: `http://localhost:8080/api`

All responses are JSON. Errors use `{ "error": { "code": "...", "message": "..." } }`.
Public Roblox data is retrieved server-side and briefly cached. API responses are not stored in the service-worker cache.

## `GET /health`

Returns service status, version, and server timestamp.

## `GET /experiences/search?q=<query>&limit=<n>`

Searches public Roblox experience discovery data.

- `q`: required, 2–80 characters.
- `limit`: optional, 1–30; defaults to 18.

Example:

```sh
curl 'http://localhost:8080/api/experiences/search?q=obby&limit=12'
```

Each result includes `placeId`, `universeId`, `name`, `creator`, `players`, `description`, and `thumbnail` (which may be `null`).

## `GET /experiences/:universeId`

Returns public game metadata for a Roblox universe ID.

## `GET /users/:userId`

Returns public Roblox user profile information.

## `GET /users/:userId/friends`

Returns the public friend list Roblox makes available for the requested user. The endpoint does not expose private friend or presence data.

## `POST /friends/:userId/join`

Reserved for a future, Roblox-supported authorization adapter. In this release it returns `501 friend_join_unavailable`. It does not accept passwords, `.ROBLOSECURITY` values, browser-storage exports, or arbitrary access tokens.

A future adapter must be reviewed, use an authorization mechanism Roblox officially supports for this use case, and return a validated `{ placeId, gameInstanceId? }` object. Do not implement cookie scraping or credential forwarding.

## Limits and behavior

- Basic per-IP request throttling is enabled.
- Roblox upstream requests have a timeout.
- Public data is cached briefly to reduce repeat requests.
- Roblox may rate-limit or change public endpoints; clients should handle `502` and `503` errors and retry with backoff.
- The API is not a general-purpose proxy. Only the documented endpoints are exposed.


## POST /api/presence

Look up public presence for 1–50 Roblox user IDs. Request JSON:

```json
{ "userIds": ["123456", "234567"] }
```

Returns a `data` array with `userId`, `presenceType`, `lastLocation`, `placeId`, `gameInstanceId`, and `joinable`. Presence type `2` means in-game. Missing server IDs are normal; privacy settings and Roblox API availability can limit results.

## POST /api/friends/:userId/join

Looks up one user's public presence. If Roblox reports an in-game presence with a valid place ID, returns an official Roblox launch URL:

```json
{ "data": { "placeId": "123456", "gameInstanceId": "...", "launchUrl": "https://www.roblox.com/games/start?...", "handoff": "official-roblox" } }
```

This is a handoff, not a promise that the friend’s server is joinable. Roblox privacy settings, server capacity, and platform support still apply. No Roblox password or `.ROBLOSECURITY` cookie is accepted.
