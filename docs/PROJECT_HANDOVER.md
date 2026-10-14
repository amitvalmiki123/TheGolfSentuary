# MaxMusic — Project Handover

Last updated: 2026-10-14 (Asia/Kolkata)
Repository: `amitvalmiki123/TheGolfSentuary`
Session branch at handover creation: `arena/45833986-thegolfsentuary`
Latest phone-accepted commit before merge: `b9e0e2c` — “Polish welcome page and keyboard search action” (Build 125)

## Read this first in a new session

1. Read this file completely.
2. Run `git status`, `git log --oneline -10`, and check the latest GitHub Actions runs before editing.
3. Continue work only on the branch assigned to that Arena session. Do not switch to, create, or push another branch unless the platform session itself is assigned to it.
4. Do not ask the user to re-explain the project history unless this document and the repository genuinely conflict.
5. The user normally communicates in Hinglish. Reply in Hinglish unless asked otherwise. Public/app-facing updater text must remain proper English.

## Product

MaxMusic is a React/Vite music app. The same frontend is used for:

- Android through Capacitor, with native background/notification components under `brand/android-native/`.
- PC/web/PWA through the same built frontend.

Preserve the Android package identity, signing key flow, stable `#yt-player-host`, IndexedDB downloads in `src/lib/db.js`, and the native templates under `brand/android-native/`. Do not edit generated `android/` output as the source of truth.

## Phone-accepted state

The user phone-tested and accepted the cumulative app through Build 125.

Important accepted milestones:

- Build 112: cover fixes and real load-more behaviour.
- Build 113: real provider pagination, recording-level deduplication, dedicated artist page, and category/late-response rules.
- Build 114: notification seekbar publication fix.
- Build 115: earbuds and notification transport controls fix.
- Build 117: polished updater popup and themes (Midnight Gold/Daylight free; Aurora, Sunset Ember, and Ocean Depth are Pro themes).
- Builds 118–121: YouTube rows are replaced only by the confidently identical Saavn recording; background YouTube rescue is preserved for genuine YouTube-only tracks.
- Build 122: fast Home loading/load-more, a dedicated Search trending feed, Search overflow fix, and genuine artist-portrait auto-sync.
- Builds 123–124: artist profile card at the top of artist searches, opening the dedicated artist page; common artist spelling variants are covered.
- Build 125: mobile keyboard Search action dismisses the keyboard, and the welcome/login page uses the real app icon, a premium card/glow design, a short tagline, and the credit “Developed by Max Amit”.

Build 125 details:

- Commit: `b9e0e2c3e86f13b0a0116c33c3f2b2a2ae002816`
- GitHub Actions run: `38396658014`
- Artifact: `max-music-apk`
- APK size: 4,777,265 bytes
- Local verification at delivery: `npm test` 86/86 and `npx vite build` passed.

## Behaviour that must not regress

### Playback and native controls

- Preserve background playback, lock-screen/notification controls, notification seekbar, earbuds transport controls, artwork, and queue behaviour.
- A confidently matched YouTube track may be canonicalized to the exact Saavn recording before playback.
- A genuinely YouTube-only track must keep the iframe/direct-rescue path and must not be silently replaced by a different song.
- Successful Saavn rescue toast: exactly “Playing Now.”
- If only the YouTube version can play, the user-facing wording is “Playing YouTube Version,” not an error-style message.

### Recording matching safety

Never substitute a different recording merely because the title matches. Keep live, remix, cover, reprise, acoustic, lofi, female, and male versions distinct unless the recording evidence proves identity.

Verified examples:

- “Nashe Si Chadh Gayi”: YouTube video `ZI3R0Gn5sa8` at about 238s matches Saavn `yshGBwsU` at 237s; the 188s remix is different.
- “Samjhawan”: a different singer/version must not replace the requested recording.
- “Pal”: the 246s male/Javed-Mohsin recording must not match “Pal (Female)” or a lofi version.
- “Pehli Dafa”: only the verified Atif Aslam recording is acceptable despite many same-title results.
- Indie examples: “Arz Kiya Hai,” “Finding Her,” and “The Last Letter” have exact Saavn matches; the YouTube “Husn” lofi cover must not become the original “Husn.”

List rendering must stay fast: exhaustive merged-provider matching belongs to one-track playback rescue, not unbounded per-row list processing. Category load-more uses fast/bounded canonicalization.

### Pagination and deduplication

- Pagination must use the real provider cursor/page state end to end.
- A duplicate-only or filtered-empty page with a valid new cursor is not provider exhaustion.
- Never loop on the same cursor.
- “End” means real provider exhaustion only.
- Show the unique loaded count; provider totals remain unknown/null unless genuinely reported.
- Recording dedup uses stable media/ISRC identity first, then normalized title, credit-order-insensitive artists, duration, and version information.
- Do not collapse distinct live/remix/reprise/acoustic/female/male versions.

### Artists

- Artist tiles and search artist cards use genuine provider artist/profile metadata only.
- Never use a song/album cover, label image, stock photo, guessed face, or another person as an artist portrait.
- If no genuine portrait is available, use the branded initials tile.
- Artist portraits may be cached under `sur_artist_portraits`.
- An artist search (`Arijit`, `Arijit Singh`, `Arijit Singh songs`, `Arman Malik`, `Sidhe Maut`, etc.) should show the artist profile card above the normal result list only when the query genuinely matches an artist. A song-title search must not promote its singer merely because that singer appears in the credits.
- Clicking the artist card opens the existing dedicated artist page. Normal search results remain below the card.

### Categories and metadata

- Hindi must exclude known Bengali tracks even when sung by Arijit Singh.
- Punjabi is a language category; Love is a mood category.
- Do not confidently relabel unknown metadata.
- Preserve the existing `sur_langs` music-language preference semantics.
- Category/query/artist changes must reset pager/cache context and reject late responses from an older selection.

### Updater and themes

- The updater popup uses proper English only, shows current/new build information, a primary “Download Update,” a later option, reassurance that the user library is safe, and only curated user-facing “What’s New” bullets.
- Never expose raw git subjects, branch names, merge text, `chore:` prefixes, or internal technical notes in the updater popup.
- Curated release bullets belong in `docs/release-features.json`; the workflow mirrors them into the feed `notes` for older installed apps.
- Free themes: Midnight Gold and Daylight. Pro themes: Aurora, Sunset Ember, and Ocean Depth. Locked themes must fall back safely for non-Pro users.

### Welcome/login and keyboard

- The welcome/login page uses `public/icon-512.png`, the tagline “Feel every beat — full songs, smooth background play & lock-screen controls.”, and the bottom credit “Developed by Max Amit.”
- The main search field is a true mobile search input (`type="search"`, `enterKeyHint="search"`, `inputMode="search"`). Its Enter/Search action commits the search, closes suggestions, and blurs the field so the keyboard dismisses.

## Main files

- `src/App.jsx` — main UI, playback, search, artists, categories, updater, themes, and welcome flow.
- `src/lib/api.js` — provider access, category pagination, Saavn canonicalization, artist profiles/songs, and cloud API.
- `src/lib/recording.js` — recording identity and safe Saavn matching.
- `src/lib/artistsearch.js` — artist-query detection for the top search profile card.
- `src/lib/feed.js` — category/query construction and metadata filtering.
- `src/lib/pager.js` — bounded load-more controller.
- `src/lib/trackmeta.js` — track identity, notification metadata, and artwork candidates.
- `src/lib/nowplaying.js` plus `brand/android-native/` — native playback/notification bridge and Android service/plugin.
- `src/lib/themes.js`, `src/lib/releasenotes.js`, `src/lib/updater.js`, `docs/release-features.json` — themes and updater.
- `server/index.js` — backend provider/API code. The repository `render.yaml` defines the backend service only.

## Merge and deployment checklist

The user authorized merging the session branch to `main` on 2026-10-14. When performing or continuing that work:

1. Confirm a clean tree and rerun `npm test` and `npx vite build`.
2. Open/update the pull request from the session branch to `main` and merge it with an explicit PR number.
3. Watch the `main` GitHub Actions run to success. On `main`, the workflow publishes a GitHub Release and bumps `docs/version.json` with a `[skip ci]` commit.
4. Verify `docs/version.json` on GitHub Pages reports the new main build and that its curated features (not raw commits) are what older apps will show.
5. Verify the PC site at `https://thegolfsentuary.onrender.com` after deployment with a hard refresh. The frontend hosting service is not defined in `render.yaml` (that file defines only `sur-sangam-api`), so do not claim the PC site updated until the live site proves it.
6. GitHub Pages is configured as legacy Pages from `main` at `/docs`; that mainly serves the download/updater landing page and `version.json`, not proof that the separate PC app deployment updated.
7. Do not redeploy or change the Render backend without a separate explicit plan/authorization. The backend deployment may lag repository changes.
8. Ask the user to phone-test the merged/public build for playback, notifications, background controls, search, artists, and login/welcome appearance.

Microsoft Store/MSIX packaging remains a separate later task.

## Standard verification commands

```sh
npm test
npx vite build
git status --short
git diff --check
```

Do not merge with failing tests, a dirty unexplained tree, or a failed production build.
