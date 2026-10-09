# Decisions

Where the spec was ambiguous, I picked the option that is simplest, most robust on iOS Safari, and easiest to extend. Each entry gives the choice and the reason.

## Tooling and dependencies

- **Versions.** Vite 7.3, React 19.3, React Router 7.18, Tailwind 4.3 (latest stable), Dexie 4.4, Zustand 5, zod 4, Motion 12, vite-plugin-pwa 1.3, Vitest 4.1, TypeScript 5.9, Playwright 1.56. Newer majors existed (Vite 8, React Router 8, Motion 14, TypeScript 7, vite-plugin-pwa 2), but some were released less than two weeks ago or have changed APIs. I chose the newest well-established major of each, pinned exactly.
- **`.npmrc` → `legacy-peer-deps=true`.** npm 10.9's resolver crashes ("Cannot read properties of null (reading 'edgesOut')") on Vitest 4's optional peer dependencies. `workbox-build`, the one real peer, still installs because it is a direct dependency of vite-plugin-pwa.
- **Dependencies added beyond the spec list**, all dev-only or explicitly suggested:
  - `fake-indexeddb` (dev): lets the repository and backup unit tests run Dexie in Node. The spec requires `backup.ts` round-trip tests.
  - `@types/node` (dev): types for the config files and E2E specs.
  - `workbox-window`: a required peer of vite-plugin-pwa.
  - `@tanstack/react-virtual` and `lucide-react`: named in the spec.
  - No UI kit, no chart library, no testing-library, no image tool. Icons are rendered from the SVG with Playwright's Chromium (`npm run icons`).
- **E2E browser.** `playwright.config.ts` defaults to **WebKit** with the iPhone 13 and iPhone SE profiles, as specified. The build container has only Chromium installed, so the suite was verified with `PW_BROWSER=chromium`, which uses the same iPhone viewport, touch, and user agent. All 14 runs (7 scenarios × 2 devices) pass.
- **Lighthouse "PWA" category.** Lighthouse 12 removed it. Installability was checked with Chrome's own `Page.getInstallabilityErrors`, which returned no errors: valid manifest, service worker controlling the page, icons 192/512/maskable. With Lighthouse 12.8 in mobile mode (simulated slow 4G, cold cache): performance 91–98, accessibility 100, best practices 100, SEO 100 on Today, Library, Train, Stats, and Settings.

## Design system

- **`--primary-500` is `#2D68FA` instead of `#2F6BFF`.** White text on `#2F6BFF` measures 4.499:1. That fails WCAG AA (axe and Lighthouse flagged the primary button). `#2D68FA` measures 4.70:1 and looks the same. Non-text uses, such as the icon gradient and `theme_color`, keep the original.
- **Extra tokens for contrast:**
  - `--text-muted-glass: #4A5878` for muted text on glass. `#5B6B8C` drops to about 4.4:1 over the blue blob.
  - `--danger-600` and `--success-600` for filled buttons with white text. The spec's 500 shades are 3.9:1 and 3.0:1 with white.
  - `--accent-700` for text on yellow fills.
  - The 500 shades remain in use for borders and icons, where 3:1 is enough.
- **Glass opacity.** Floating surfaces that sit over moving content (sheets, dialogs, action bars, a scrolled header) use a more opaque glass, white at 0.72–0.93. Blur and border are kept. This guarantees text contrast whatever scrolls underneath. The decorative blobs sit at 30–45% opacity for the same reason.
- **Dynamic Type.** The root font follows iOS Dynamic Type via `font: -apple-system-body`, so `1rem` is 17px by default, and the type scale is in rem. Spacing stays on a fixed 4px grid. Inputs use `font-size: max(16px, 1rem)`, so even the smallest Dynamic Type setting cannot trigger Safari's zoom on focus.
- **Hover.** Tailwind v4's `hover:` variant is already wrapped in `@media (hover: hover)`, so no custom variant was needed.
- **Reduced motion.** `MotionConfig reducedMotion="user"` turns transform animations into fades. The flashcard flip becomes a crossfade, and the CSS shake and glow fall back to a fade-in.
- **Splash screens.** Optional `apple-touch-startup-image` files were not added. iOS shows the near-white background, which matches `--bg-top`.

## Data

- **`archived` is not indexed.** IndexedDB cannot index booleans; Dexie silently skips such records. Archive filtering happens in memory, because the library is loaded fully for search anyway.
- **`ReviewLog.practice?: boolean`** (an additive field) marks answers given in practice-only sessions. **`SessionPreset.practiceOnly/autoPlay?`** store the builder's options.
- **Persisted session.** There is one extra table, `sessions`, with an `active` row (queue, results, elapsed time) and a `last` row (for the summary screen). The session row is written in the same transaction as each answer's log and card update.
- **Duplicate detection** compares `normalizeTerm` (trim, lowercase, collapse spaces, unify apostrophes). An index lookup comes first, then a full scan, which is fine for a few thousand words.
- **Status.** A word is "Выучено" only when both cards are in `review` with an interval of 21 days or more. "Сложные" means summed `wrongCount ≥ 3` or summed `lapses ≥ 2` across both directions.
- **Practice-only** leaves the `ReviewCard` completely untouched, including the correct and wrong counters. Only the log is written.
- **Backups** always contain the *effective* settings (defaults merged in), so a round trip is byte-identical. Restore validates with zod and rejects duplicate ids. It also self-heals harmless gaps: it drops orphan cards and logs, recreates missing cards, and strips unknown tag ids. A backup from a newer schema version is refused with its own message.
- **Merge** keeps the side with the newer `updatedAt` for each word, along with that side's cards. Logs are unioned by id. Tags and presets are added only if their id is missing. Local settings are kept.

## Spaced repetition

- **Learning steps.** `repetitions` counts consecutive successful learning steps:
  - Good on a new card goes to the 10-minute step.
  - Good after that step graduates the card to 1 day.
  - Again resets the step. Hard keeps it.
  - Ease does not change during learning.
- **Review intervals are kept strictly increasing:** hard ≥ current + 1, good ≥ hard + 1, easy ≥ good + 1, as in Anki. Without this, a 1-day card at minimum ease would never grow (1 × 1.3 rounds to 1). Easy uses the ease *before* the +0.15 bump.
- **Relearning:**
  - Again or Hard keeps the card in relearning, due again in 10 minutes. No second lapse is counted.
  - Good returns the card to review with the stored post-lapse interval, `max(1, interval × 0.5)`.
  - Easy returns it with `max(interval + 1, interval × 1.3)`.
- **Due dates for review cards** fall at the *start* of a study day (`dayStartsAtHour`), so "due now" and "due today" agree. They are computed with the local `Date(y, m, d + n, h)` constructor, which handles DST. Learning steps use real minutes.
- **Fuzz.** The seed is `hash(cardId + reviewedAt)`, so scheduling is deterministic, and tests can pass their own seed. Interval previews on the buttons are unfuzzed.
- **Automatic grading:**
  - Wrong → Again.
  - Correct but slower than 8 seconds, or accepted with a typo → Hard.
  - Correct → Good.
  - One typing hint caps the grade at Hard. **Two or more hints count as not known** (Again, not correct), since the word was mostly given away.

## Training

- **Sources.** Automatic sources (all, tag, hard, due, new) skip archived words. An explicit selection ("Выбранные слова") trains exactly what was picked, archived words included. Deleted ids are skipped quietly.
- **The count applies to words.** A session covers each word × each chosen direction. For "Пора повторить" only the due cards are included, and for "Новые" only the new cards.
- **Order.** "По порядку" lists all EN → RU cards, then all RU → EN cards. This naturally keeps a word's two directions apart.
- **Queue:**
  - A wrong card is re-inserted *k* ∈ [3, 5] places later, or at the end if fewer cards remain.
  - Each card can be re-inserted at most 3 times. A fourth wrong answer clears it, so the session can end.
  - After every change, a pass separates cards of the same word.
  - The progress counter shows *cleared cards / total cards*.
- **Distractors** come from the whole library, archived words included, because they only serve as wrong options.
  - Excluded: the target itself, any word whose term or translation overlaps the target's (ё/е- and case-insensitive), and duplicate option texts.
  - Preferred: words sharing a tag, then options of similar length.
  - Distractors that are synonyms of each other are avoided, but allowed as a last resort.
  - A card is eligible for Выбор ответа when at least 3 distractors exist; otherwise it falls back to flashcards. The builder disables the mode entirely when the library has fewer than 4 words.
- **Listening:**
  - For an EN → RU card, you hear the word and pick its translation from 4 options, or type it if there aren't enough options.
  - For a RU → EN card, you hear the word and type it.
  - The word plays automatically, but only after a tap in the current session.
  - TTS counts as unsupported when no voices are available after the 2-second `voiceschanged` timeout.
- **Cloze:**
  - The matcher accepts `-s/-es/-ed/-d/-ing`, plus e-drop, y → i, and consonant doubling.
  - For phrases, the first word may inflect ("gives up"), and so may the last.
  - The expected answer is the form that appears in the sentence. Typing the dictionary form instead counts as "Почти" (Hard).
  - Words without a matching example are left out, and the builder shows how many.
- **Pairs.** Up to 5 cards are taken per round: same direction, distinct words, and no overlapping meanings. A word is correct only if it was never part of a wrong pair. A single leftover card falls back to a flashcard.
- **Mixed** follows the spec's state table. Among the eligible modes for a card, one is chosen at random. If none fits, the fallback is flashcards for new cards and typing otherwise.
- **Typing keeps the iOS keyboard open** between cards. The input stays mounted, since components are keyed by mode rather than by card, and the buttons don't take focus.
- **Resume.** iOS relaunches a killed PWA at `start_url`. On launch, if an unfinished session exists and wasn't started in this page lifetime, a dialog offers "Продолжить" or "Завершить". Reloading on `/session` resumes directly. Time per card is capped at 2 minutes, so a backgrounded app doesn't inflate the time spent.
- **Closing a session** with at least one answer moves it to the summary with the title "Тренировка остановлена". With no answers, it is simply discarded.

## Today and Stats

- **Daily goal.** Counts distinct words reviewed in the current study day, practice answers included.
- **Streak.** Counts consecutive study days with at least one review. The streak stays alive until today ends, even if nothing has been reviewed yet today.
- **"Новые слова (M)".** `M = min(newWordsPerDay − words first reviewed today, words still entirely new)`. When nothing is due, the "Всё повторено" card offers new words and free training.
- **The review button** starts a mixed session, in both directions, over every card due before the end of the study day.
- **Charts** follow the data-viz guidance:
  - The heatmap uses a single blue hue as a sequential scale, has a legend, outlines today in yellow, and shows date and count when a cell is tapped.
  - The forecast is plain SVG with ≤ 24px bars and 4px rounded tops. It labels only today and the peak; tapping a bar shows its value.
  - Both charts include a visually hidden table for screen readers.

## Library and UX

- **Selection** survives search and filter changes. "Выбрать все" adds the currently filtered words. "Случайные N…" *replaces* the selection with N random words from the filtered list. The selection is cleared on cancel or when a session starts.
- **Swipe and long press** are implemented with pointer events and `touch-action: pan-y`, so vertical scrolling stays native. Swipe and long press are disabled in selection mode. Only one row can be open at a time.
- **Virtualization** turns on above 100 rows, with measured row heights.
- **The add/edit sheet** goes full screen when the viewport height is 700px or less (iPhone SE class). It sits above the keyboard using `visualViewport`, and the focused field scrolls to the centre. Tags are kept after "Сохранить и добавить ещё", which helps batch entry into one topic.
- **Import.** A row repeated within the same file is always skipped and labelled "повтор в файле". Library duplicates follow the chosen mode (skip, update by merging translations, examples and tags, or add). The CSV delimiter (`,`, `;` or tab) is auto-detected from the first line.
- **Export** uses `navigator.share({ files })` when `canShare` allows it, and falls back to a download link. `lastBackupAt` is not updated if the user cancels the share sheet.
- **Install banner.** It appears only on iOS when the app isn't running standalone. Safari users get Share → «На экран „Домой“» instructions; other iOS browsers are told to open the page in Safari. A dismissal is remembered in `localStorage` for 14 days, which is a per-device convenience only.

## Performance

- **Initial JS is about 150 KB gzipped,** against a 250 KB target. The built-in dictionary (about 75 KB gzipped) is its own lazy, precached chunk.
  - Route chunks are lazy, except Today, the start screen.
  - Motion lives only in lazy chunks; each animated component brings its own `MotionConfig`.
  - zod loads only with dictionary autofill and backup restore.
  - The session planner loads when a session is started.
  - The chunk for a deep-linked route starts downloading before React renders.
- **With 2,000 words at 4× CPU throttling:**
  - Library cold render is about 0.47 s; about 12 rows are in the DOM.
  - Scrolling holds a p95 frame time of 16.8 ms.
  - Search results appear in about 280 ms, including the 150 ms debounce.
  - Planning a 2,000-word mixed session takes about 40 ms. Normalized keys are cached per word, and eligibility checks exit early.

## Built-in dictionary («Слова дня»)

- **A curated offline word list instead of an AI service.** It needs no API key, network or account, and the translations are reviewed rather than generated per request. The data is 2,004 words in 16 topics and 1,007 phrases in 6 topics, levelled A1–C1.
- **Format.** Plain `term|translations|LEVEL|example` lines in TS template strings: compact, easy to edit and diff. Ids are `w:`/`p:` + the normalized term, so they stay stable across edits to translations or examples. A unit test checks the counts, unique ids, valid levels and topics, and that every example works in the cloze mode.
- **Schema v2** adds the `bankMarks` table («Знаю» marks) and the `daily` table (one pick per study day). The migration only adds tables and settings defaults; existing data is untouched. Backups include `bankMarks`. v1 backups still restore. Daily picks are not backed up because they are regenerated.
- **The pick is deterministic per study day** (a seeded shuffle of the filtered pool) and persisted, so it does not change on reload or after editing the library. Words and phrases are mixed about 2:1. Items already in the library (by normalized term) or marked known are skipped. Changing settings applies from the next day, or immediately with «Обновить подборку на сегодня».
- **Adding to the library** goes through the normal import path (one transaction, duplicate check). The item's topic becomes a tag, and its level is recorded in the note.
