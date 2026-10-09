# WordFlow

An offline-first vocabulary trainer for Russian speakers learning English, built as a Progressive Web App for iPhone (installed to the Home Screen from Safari). The UI is in Russian; word pairs are English ⇄ Russian.

- **Your own word library**: tags, search (case-, diacritic- and ё/е-insensitive), filters, sorting, swipe to archive/delete with undo, and bulk import from text or CSV.
- **Train exactly the words you want**: pick them by hand, by filter, at random ("Случайные N…"), by tag, hard words, or whatever is due.
- **Spaced repetition** (an SM-2 variant with learning steps), tracked separately for EN → RU and RU → EN. There is a practice-only option that does not touch the schedule.
- **Seven modes**: Карточки, Выбор ответа, Написание, Аудирование, Пропуск в предложении, Пары, Смешанный. Wrong answers come back later in the same session.
- **Works fully offline** after the first load. Data is stored on the device in IndexedDB. You can make a JSON backup or a CSV export through the iOS share sheet, and restore with replace or merge.

## Quick start

```bash
npm install          # Node ≥ 20.19 (22 recommended)
npm run dev          # http://localhost:5173 (no service worker in dev)
```

`.npmrc` sets `legacy-peer-deps=true` to work around an npm 10 resolver crash on Vitest's optional peer dependencies (see DECISIONS.md).

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server. |
| `npm run dev:host` | Dev server on your LAN (`vite --host`). |
| `npm run build` | Typecheck (both tsconfigs), then a production build into `dist/` with the service worker and manifest. |
| `npm run preview` | Serves `dist/` (service worker active). Use this to test offline and install behaviour. |
| `npm run typecheck` | `tsc --noEmit` for the app, the unit tests, and the config/E2E files. |
| `npm test` | Vitest unit tests (`tests/unit`). They run in the `Europe/Berlin` time zone so the DST cases are meaningful. |
| `npm run test:e2e` | Playwright E2E tests (`tests/e2e`), using **WebKit** with the iPhone 13 and iPhone SE profiles. Builds and previews the app automatically. |
| `npm run test:e2e:chromium` | The same suite on Chromium with the same iPhone emulation, for machines without the WebKit build. |
| `npm run icons` | Regenerates every PNG icon from `scripts/icon.svg`, rendered with Playwright's Chromium. |
| `npm run deploy` | Builds and deploys to Netlify (needs `npx netlify-cli login` once). |
| `npm run deploy:vercel` | Alternative: deploys to Vercel. |

For WebKit E2E runs, install the browser once on your machine with `npx playwright install webkit`.

## Testing on a real iPhone

Service workers, installation, and persistent storage need **HTTPS**. `localhost` is the only exception, and your iPhone can't reach your computer's `localhost`. Pick one of these:

**A. HTTPS tunnel (simplest)**

```bash
npm run build && npm run preview -- --port 4173
# in a second terminal, either:
cloudflared tunnel --url http://localhost:4173     # prints https://<random>.trycloudflare.com
ngrok http 4173                                    # prints https://<random>.ngrok-free.app
```

Open the printed `https://…` URL in **Safari** on the iPhone. The tunnel hosts are already allowed in `vite.config.ts` (`server/preview.allowedHosts`).

**B. Local certificate with mkcert**

```bash
brew install mkcert && mkcert -install && mkcert 192.168.1.20   # your computer's LAN IP
npm run build
HTTPS_CERT=./192.168.1.20.pem HTTPS_KEY=./192.168.1.20-key.pem npm run preview -- --host --port 4173
```

Install the mkcert root CA on the iPhone (AirDrop `rootCA.pem`, then Settings → General → VPN & Device Management, and enable full trust under Settings → General → About → Certificate Trust Settings). Then open `https://192.168.1.20:4173`.

Use `npm run dev` only for fast UI iteration. The dev server does not register the service worker.

## Deploying

Any static host with HTTPS works. The host must:

1. Serve `index.html` for unknown routes (SPA fallback), so deep links and reloads in standalone mode don't 404.
2. **Not** cache `sw.js`: send `Cache-Control: no-cache`. Otherwise users stay stuck on an old version.

The repo ships with config for:

- **Netlify**: `netlify.toml` (build, SPA redirect, headers). Run `npm run deploy`.
- **Vercel**: `vercel.json` (rewrites and headers). Run `npm run deploy:vercel`.
- **Cloudflare Pages**: build command `npm run build`, output `dist`. `public/_headers` sets the cache headers, and Pages serves `index.html` for unknown routes automatically.

When a new version is deployed, open apps show a small toast, "Доступна новая версия — Обновить". The new version is never swapped in during a training session.

## Installing on iPhone

1. Open the site in **Safari**. Other iOS browsers can't install it properly; the app tells you so.
2. Tap **Share** (the square with an arrow), then **«На экран „Домой“»**, then **Добавить**.
3. Always open WordFlow from the Home Screen icon. It runs full screen and works offline.

The app shows an install hint in Safari, which you can dismiss for 14 days, and has a guide under Настройки → «Как установить на iPhone».

> **Important:** Safari and the installed app have **separate storage**. Words added in Safari don't appear in the installed app. Use the installed app, and move data between them with a backup.

## Backing up your data

All data lives only on the device. iOS may delete storage for web apps that haven't been opened for a long time, even though WordFlow asks for persistent storage. Settings shows whether that request was granted.

- **Back up**: Настройки → «Резервная копия (JSON)». On iPhone this opens the share sheet; choose «Сохранить в Файлы» or send it to yourself. The file is `wordflow-backup-YYYY-MM-DD.json` and contains words, review cards, tags, history, presets, and settings.
- **Restore**: Настройки → «Восстановить из копии», then pick the file and choose:
  - **Заменить всё**: the device ends up exactly as in the backup.
  - **Объединить**: adds missing words; when a word exists on both sides, the newer edit wins.

  The file is fully validated first, and you confirm a summary before anything is written. If the restore fails, nothing changes.
- **CSV export**: `term, translations, transcription, example, tags`. You can import it back with «Импорт».
- When you have at least 10 words and no backup in the last 14 days, the «Сегодня» screen shows a reminder.

## Importing words

Open Библиотека → ⋯ → «Импорт».

- **Text**: one word per line, for example `give up - сдаваться, бросать`. The separator between word and translation can be ` - `, `—`, `–`, `:`, `;` or Tab. Separate multiple translations with commas. A transcription can be added in the word part: `apple [ˈæp.əl] - яблоко`.
- **CSV**: columns `term, translations, transcription, example, tags`. The header row is optional, columns can be in any order, and `;` works as a delimiter (Excel in a Russian locale). Quotes, BOM, and CRLF are handled. Separate several examples with `|`.

A preview lists rows that will be added, duplicates (choose skip, update, or add anyway), and errors with the reason. Nothing is written until you confirm, and the import runs as one transaction.

## Architecture

```
src/
  app/        shell, router + route preloading, error boundaries, DB gate, SW update toast, resume prompt
  screens/    Today, Library, WordDetail, WordEditor, Import, SessionBuilder, Session,
              SessionSummary, Stats, Settings, InstallGuide
  components/ GlassPanel, Button, Chip, BottomSheet, Dialog, Toaster, ProgressRing, Heatmap,
              ForecastChart, EmptyState, Toggle, Segmented, Stepper, …
  modes/      Flashcard, MultipleChoice, Typing, Listening, Cloze, MatchPairs (+ shared bodies)
  db/         schema.ts (Dexie), migrations.ts, repo.ts (all writes), queries.ts (live reads), backup.ts
  lib/        srs, answerCheck, sessionQueue, selection, sessionPlan, modes, distractors, cloze,
              importParser, csv, dates, stats, normalize, library, format, …  (pure, unit-tested)
  hooks/      useSpeech, useStandalone, useVisualViewport, usePersistentStorage, useNow, useDebounce
  store/      zustand: UI state (library filters/selection, editor, toasts, session UI)
  i18n/ru.ts  every user-facing string
tests/unit    Vitest (fake-indexeddb for repo/backup)
tests/e2e     Playwright (iPhone 13 + iPhone SE)
```

- **The source of truth is IndexedDB** (Dexie, with versioned schema migrations). Zustand only holds ephemeral UI and session state.
- **Every multi-step write is a single transaction**: adding a word with its two cards; recording an answer with its log, card update, and session progress; import; restore; delete. Components never write to Dexie directly; they go through `src/db/repo.ts`.
- **The scheduler sits behind an interface** (`Scheduler` in `src/lib/srs.ts`), so FSRS can replace SM-2 later without touching callers.
- **Initial JS is about 142 KB gzipped.** Route chunks are lazy and precached by the service worker. The chunk for a deep-linked route starts downloading before React renders.

See **DECISIONS.md** for the judgement calls made where the spec was open.
