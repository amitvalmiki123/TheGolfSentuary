# Sur Sangam — Live + APK Guide (Tumhare liye maine kya kiya + tumhe kya karna hai)

## ✅ Maine kya kar diya (Auto)

### 1. Categories Fixed
Top bar me ab clickable categories hain:
`All ✨ | Hindi 🇮🇳 | Punjabi 🔥 | Love 💜 | 90s Hits 📻 | Bollywood 🎬 | Indie 🌙 | Trending 📈 | New 🆕`
- Click → auto queue + Play All banner + curated playlists filter
- File: `src/App.jsx` → `categories` array + `categoryMap` + `getCategoryTracks()`

### 2. PWA + APK Base Ready
- `vite-plugin-pwa` installed
- `vite.config.js` me PWA manifest + workbox cache (images/audio/APIs)
- Icons: `public/icon-512.png` (1.2MB), `icon-192.png`, `apple-touch-icon.png`
- `capacitor.config.json` → `com.sursangam.app`
- Build: `npm run build` → `dist/` me `sw.js`, `manifest.webmanifest` generate
- ZIP: `sur-sangam-pwa.zip` repo me pushed (2.4MB)

### 3. Live Deploy — GitHub Pages
- Branch `gh-pages` banaya → `dist` (base `/TheGolfSentuary/`) push
- Pages source `gh-pages` enabled
- **Live URL:** `https://amitvalmiki123.github.io/TheGolfSentuary/` (2-3 min me build ke baad live, status: `building`)
- Checks: `gh api repos/amitvalmiki123/TheGolfSentuary/pages`

### 4. GitHub Release
- Tag `v1.0.0-pwa` banaya (ZIP upload try kiya but uploads.github.com outbound blocked, isliye ZIP seedha repo me hai: `arena/f257d954-thegolfsentuary/sur-sangam-pwa.zip`)

---

## 🛠️ Tumhe Manual kya karna hai (Step-by-Step)

### A. Live URL Verify (2 min)
1. 2-3 min wait karo → https://amitvalmiki123.github.io/TheGolfSentuary/ kholo
2. Agar 404 aaye to: GitHub → Settings → Pages → Source: `gh-pages` / `/ (root)` → Save → 1 min wait
3. Chrome me kholo → Install prompt ayega → Install karke APK jaisa test karo

### B. Uptodown ke liye APK Generate (PWABuilder — Sabse Easy, No Android Studio)
1. Live URL copy karo
2. https://www.pwabuilder.com → URL paste → **Start** → **Build My PWA**
3. Score check hoga → **Package For Stores** → **Android**
4. Options: Signing: `Generate` (PWABuilder signing), Package ID: `com.sursangam.app`, Name: `Sur Sangam`, Display: `standalone`, Theme: `#060306`
5. **Download** → `apk` / `aab` मिलेगा → wahi Uptodown pe upload karna hai
6. Video guide: PWABuilder site pe 2-min tutorial hai

**Alternative — Capacitor (Agar tumhare PC pe Android Studio hai):**
```bash
git clone https://github.com/amitvalmiki123/TheGolfSentuary.git
cd TheGolfSentuary
git checkout arena/f257d954-thegolfsentuary
npm install
npm run build
npx cap add android   # first time only
npx cap copy android
npx cap open android  # Android Studio → Build → Generate Signed Bundle / APK
```
- Keystore manually generate karna hoga: Android Studio → Generate Signed Bundle → Create new keystore

### C. Uptodown pe Publish (https://en.uptodown.com/android/publish)
1. Login / Register
2. **Publish App** → APK/AAB upload (PWABuilder wala)
3. Details bharo:
   - Name: `Sur Sangam`
   - Icon: `public/icon-512.png` (Upscale to 1024 agar maange to: https://imresizer.com)
   - Screenshots: Live site se 5-6 lo (Home with categories, Player full, Library with Downloads, Profile)
   - Category: `Music & Audio`
   - Description paste karo (README_APK.md se):
     > Dark Mode Aesthetic Music Player — like Gaana / JioSaavn / Spotify. Punjabi 🔥 Hindi 🇮🇳 Love 💜 90s Hits 📻 Bollywood 🎬 Indie 🌙 Trending 📈 Offline downloads, local files, real-time iTunes+Saavn search, playlists, liked songs, queue, lyrics. Backend Live (localStorage + IndexedDB).
   - **Privacy Policy URL required** → simple page banao: https://www.privacypolicygenerator.info/ se generate → GitHub Gist me daalo → link do
4. Submit → Review 1-2 din

### D. Custom Domain (Optional)
Uptodown listing me tum `https://amitvalmiki123.github.io/TheGolfSentuary/` URL dikha sakte ho, ya Vercel pe custom domain (sur-sangam.vercel.app) banao:
```bash
npm i -g vercel
vercel --prod
# domain add: vercel domains add sursangam.com
```

### E. Play Store (Optional, same APK)
PWABuilder ka `aab` Google Play Console pe bhi upload hota hai. Play ke liye $25 one-time fee + signing.

---

## 📦 Repo Files Tumhare kaam ke
- `src/App.jsx` → categories + player + backend
- `src/lib/api.js` → iTunes + Saavn unified search
- `src/lib/db.js` → IndexedDB downloads
- `public/icon-*.png` → Uptodown icons
- `sur-sangam-pwa.zip` → direct download: https://github.com/amitvalmiki123/TheGolfSentuary/raw/arena/f257d954-thegolfsentuary/sur-sangam-pwa.zip
- `README_APK.md` → full APK guide

---

## ❓ Agar Live URL 404 dikhe
- Branch `gh-pages` exists? `git branch -r | grep gh-pages`
- GitHub Pages Settings me Source `gh-pages` select karo
- Ya Vercel pe deploy karo (1 drag-drop, no config)

Batao kis step pe atke ho — main turant fix kar dunga!
