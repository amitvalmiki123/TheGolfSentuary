# Sur Sangam — APK & Publish Guide

## Live Preview (PWA — installable like APK)
https://5173-igzfx0nf56zr6bcdauzq0.e2b.app

On Android Chrome: Menu → "Install app" / "Add to Home screen" → Standalone APK-like app (offline works via Service Worker).

## Build PWA (offline-ready)
```bash
npm install
npm run build   # generates dist/ with service worker + manifest
npm run preview # test PWA locally
```

## Generate APK (2 options)

### Option A — PWABuilder (Recommended for Uptodown, no Android SDK needed)
1. Deploy `dist/` to Vercel / Netlify / GitHub Pages (see "Deploy Live" below)
2. Go to https://www.pwabuilder.com
3. Enter your live URL → "Build My PWA" → Choose Android → Generate APK/AAB
4. Download signed APK → Upload to Uptodown: https://en.uptodown.com/android/publish

PWABuilder wraps your PWA in a Trusted Web Activity (TWA) — Google Play & Uptodown approved.

### Option B — Capacitor (Native WebView APK, requires Android Studio)
```bash
# One-time setup (on your PC with Android Studio installed)
npm install
npm run build
npx cap init "Sur Sangam" com.sursangam.app --web-dir=dist
npx cap add android
npx cap copy android
npx cap open android   # opens Android Studio → Build → Generate Signed APK/AAB

# Quick debug APK (if Android SDK installed)
npx cap copy android && npx cap run android
```

Capacitor config is at `capacitor.config.json` (appId: com.sursangam.app, webDir: dist).

## Deploy Live (for Uptodown listing URL)
### Vercel (1-click)
```bash
npm i -g vercel
vercel --prod   # link dist
```
### Netlify
Drag `dist/` folder to https://app.netlify.com/drop

### GitHub Pages
```bash
npm run build
# push dist to gh-pages branch via gh-pages package or manually
```

Set `vite.config.js` base if deploying to subpath: `base: '/repo-name/'`

## Uptodown Publish Checklist
- APK/AAB from PWABuilder or Capacitor
- App Name: Sur Sangam
- Package: com.sursangam.app
- Icon: public/icon-512.png (1024x1024 recommended, we have 512 — upscale if needed)
- Screenshots: Take from live preview (Home, Player, Library, Profile)
- Description: "Dark Mode Aesthetic Music Player — like Gaana / JioSaavn / Spotify. Punjabi 🔥 Hindi 🇮🇳 Love 💜 90s Hits 📻 Bollywood 🎬 Indie 🌙 Trending 📈 Offline downloads, local files, real-time iTunes+Saavn search, playlists, liked songs."
- Category: Music & Audio
- Privacy Policy: Add simple page (required)

## Categories Implemented
Top pill bar: All ✨, Hindi 🇮🇳, Punjabi 🔥, Love 💜, 90s Hits 📻, Bollywood 🎬, Indie 🌙, Trending 📈, New Releases 🆕
Click any pill → auto-queues that category's songs, "Play All" banner appears, curated playlists filter too.

Enjoy!


## Native APK updates (Build 129 onward)

- Android downloads HTTPS release assets directly into `cacheDir/updates`, follows
  GitHub asset redirects, reports live progress, and opens Android's installer via
  FileProvider. Cancel removes the partial file; Retry starts a fresh transfer.
- If Android requires “Install unknown apps”, allow it for MaxMusic and return to
  **Install / settings**. The cached APK is reused; that button also reopens the
  installer if its prompt was dismissed. Installer success is not assumed: Android
  owns the final confirmation.
- Download errors expose **Browser me kholo**. Web/PWA update gating is unchanged;
  old APKs without the plugin keep their existing browser fallback.
- **Compatibility:** Build 128 cannot acquire a Java plugin through a feed update.
  Its 128 → 129 update still uses the old browser flow. Native downloading becomes
  available after installing 129, for subsequent updates.
- Optional R2 mirroring requires repository secrets `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_BASE`.
  Configure the bucket's public HTTPS base URL. With missing secrets the step skips
  silently; unsuccessful uploads never put a mirror URL in the feed. The primary
  GitHub release always remains available. No third-party APK store is used.
- `Native APK PR check` runs all tests and Gradle `assembleRelease` (unsigned) before
  merging, without consuming the Android release workflow's build counter. Main
  then produces the normally signed release and writes `docs/version.json` itself.
  Do not hand-edit that feed.

Phone smoke test: check the update popup on 128, install 129, ensure the app icon
and centred popup styling remain intact; on the next available update verify live
percentage/progress bar, Cancel → Retry, installer prompt, unknown-app settings →
Install / settings, and error → browser fallback. Mirror is visible only when a
successful mirror URL exists in the release feed.
