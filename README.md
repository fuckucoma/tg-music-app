# tg-music-app

React, TypeScript and Vite power the desktop site, mobile site and Telegram Mini App. The layout changes at 651 px. Authentication, catalog, search, favorites and the active audio player are shared across layouts.

## Local development

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Start the Express backend on port 4000 or set `VITE_API_BASE_URL` to your deployed API. `npm run dev:desktop` opens the same responsive app at `127.0.0.1:5180` and proxies `/backend` through Vite.

```powershell
npm run build
```

Deploy `dist/` to your static host. Set `VITE_API_BASE_URL` to the API's HTTPS URL and add the frontend origin to the backend's `CORS_ORIGINS` if it differs from the default. To open the Mini App from Telegram, set the same HTTPS URL in the bot's menu button in [BotFather](https://t.me/BotFather).

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable Realtime updates of the public catalog. The browser uses a public key for this subscription. The backend uses a separate service key for Storage.

## Listen on multiple devices

In the website profile, generate a Telegram link code, then enter and confirm it in the Mini App profile. Both sign-ins then use the same account and queue.

Start a track on the website, then open the Mini App on the linked account to control it. Open the device picker from the desktop player or the mobile header to move audio to another connected device. Tap **Continue playback here** if the receiving browser or Telegram requires interaction to start audio. Guests can play music locally.

## Project structure

- `src/app` starts the app and owns the shared player provider.
- `src/layouts` contains the responsive shell and desktop and mobile layouts.
- `src/features` contains auth, profile, player, library, search and favorites logic.
- `src/components` contains shared UI, including track rows, artwork and search.
- `src/platform/telegram` initializes the Telegram SDK and handles theme and haptics.
- `src/services` contains the backend API client and Realtime subscription.
