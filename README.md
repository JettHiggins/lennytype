# multitype

A minimal multiplayer typing game inspired by Monkeytype. Thirty-second races, identical words for all players, and smooth colored cursors. No accounts, cars, or distractions.

## Run locally

Requires Node.js 22.13 or newer. No dependencies to install.

```sh
npm run dev
```

Open http://localhost:3000. Open the same room link in another browser or device to race together. On your local network, replace `localhost` with your computer's IP address. Local state is kept in `.local/multitype.sqlite`.

## Play

- **Race:** join the public lobby, or use **invite friends** to create a private room or enter a six-character room code. Up to eight players per room. The host starts a shared three-second countdown followed by a 30-second race.
- **Practice:** start typing for an immediate solo test.
- Correct mistakes with Backspace. Ctrl/Option+Backspace clears the current word. Space submits a word; an incorrect previous word can be revisited with Backspace.
- Enter starts a race or rematch. Tab+Enter restarts practice. Escape releases focus. Shared races always run the full 30 seconds.
- Settings control smooth cursors, live stats, and three themes. Names and preferences stay in your browser.

Players' positions are synchronized through the backend, with cursor transitions between updates. Disconnected players leave after 12 seconds; the next active player becomes host. There are no simulated opponents. Room membership is limited to players with a live session token. Room links grant room access, so share them with the people you want to race.

## Build and hosting

```sh
npm run build
npm test
```

The build embeds the frontend, font, and English dictionary into `dist/server/index.js`, a Cloudflare Worker. Production uses a D1 `DB` binding and the migration in `drizzle/`. The local server uses Node's SQLite adapter for the same SQL and Worker API. `.openai/hosting.json` contains the Sites project and binding declaration.

This is a casual race game. Scores are client reported and are not suitable for ranked or prize-based competition without server-side input validation and anti-cheat work. The hosted Site is accessible to anyone with its link.

## License

GPL-3.0. Includes Monkeytype's English word list and Roboto Mono. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
