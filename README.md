# lennytype

Multiplayer typing with smooth shared cursors. Create a room, join one from the list or by code, and race for 30 seconds. Up to eight people. Rooms stay blank until the race starts. Anyone can leave at any time.

## Local development

Node.js 22.13 or newer. No dependencies to install.

```sh
npm run dev
```

Open http://localhost:3000 in two browsers. Create a room in one, then select it from **join room** in the other. The host starts the race. Click the room code to copy its invite link.

Names, themes, cursor smoothness, and live stats are in the header controls. Enter starts a race or rematch. Backspace corrects mistakes; Ctrl/Option+Backspace clears the current word. Escape releases typing focus. Shared timers keep running when someone leaves.

```sh
npm test
npm run build
```

The static build is in `dist/pages`. Local SQLite state is in `.local/lennytype.sqlite`.

## Hosting

See [docs/HOSTING.md](docs/HOSTING.md) for GitHub Pages deployment, your own multiplayer backend, and removing the previous ChatGPT Site. The frontend uses relative asset URLs, so it works at both `username.github.io/` and `username.github.io/lennytype/`.

GitHub Pages serves the frontend. The multiplayer API runs separately as a Cloudflare Worker with a D1 database. There is no dependency on ChatGPT Sites in the new build. `docs/previous-sites-hosting.json` records the old Site ID only; it is not used by any build or deployment.

The GitHub workflow uses the repository variable `LENNYTYPE_API_URL` for the API origin. It contains no secret. The backend accepts cross-origin requests only from the exact origins configured in `ALLOWED_ORIGINS`. Players authenticate with per-room session tokens.

This is a casual game: scores are client reported. Rooms with no active players disappear from the list; the last player leaving deletes the room. Inactive players time out after 12 seconds, and an active player inherits the host role.

## License

GPL-3.0. Includes Monkeytype's English word list and Roboto Mono. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
