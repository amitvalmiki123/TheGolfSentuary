# Sur Sangam — MongoDB + Render Setup Guide (step by step)

## Part A — MongoDB URI kaise banega (Atlas free, 5 min)

MongoDB ka "database" aapke laptop par install nahi hoga — **Atlas** (MongoDB ki official cloud) par free cluster banega, aur uska **connection string = MONGO_URI** hota hai.

1. **Account:** https://account.mongodb.com/account/register → email se signup (free M0 plan)
2. **Project:** login ke baad "New Project" → naam `sur-sangam` → Create
3. **Cluster:** "Build a Database" → **Free (M0)** region `AWS Mumbai (ap-south-1)` → Create (~1 min)
4. **User:** "Database Access" (ya Quick Start me prompt aayega) → **Add New Database User**
   - Username: `sursangam`
   - Password: kuch strong banao (e.g. `SurSangam@2026x`) — **yahi DB password hai, save kar lo**
   - Role: Read and write to any database
5. **Network:** "Network Access" → **Add IP Address** → "Allow Access from Anywhere" (`0.0.0.0/0`) → Confirm
   (Render ka server IP fix nahi hota, isliye anywhere rakho — password ke bina kuch nahi ho sakta)
6. **URI:** "Connect" button → **Drivers** → copy:
   ```
   mongodb+srv://sursangam:<password>@cluster0.xxxxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   `<db password>` ki jagah apna password paste karo.
7. **DB ka naam do** — `@` ke baad, `/?` se pehle `sur-sangam` likho:
   ```
   mongodb+srv://sursangam:SurSangam%402026x@cluster0.xxxxxxx.mongodb.net/sur-sangam?retryWrites=true&w=majority
   ```
   ⚠️ Password me `@ # % & /` ho to URL-encode: `@`→`%40`, `#`→`%23`. (Simple alphanumeric password rakho to tension hi nahi.)

**Bas — ye poori line hi `MONGO_URI` hai.**

## Part B — Local PC par chalana

```bash
cd sur-sangam/server
npm install
copy .env.example .env      # (mac/linux: cp)
# .env kholo, 3 values bharo:
#   MONGO_URI=<Part A wali line>
#   JWT_SECRET=kuch-bhi-lambi-random
npm run dev
```
Console me aana chahiye:
```
✅ MongoDB connected: sur-sangam
✅ Sur Sangam server LIVE on http://0.0.0.0:3001
```
Test browser me: `http://localhost:3001/health` → `"db":"MongoDB"`

Ab app (`npm run dev` root se, port 5173) backend se search/tracks lega. **MONGO_URI galib/empty = server phir bhi chalega** (memory mode, live Saavn/Piped proxy) — DB sirf login/signup/liked/playlists/for ke liye zaroori hai.

## Part C — Render.com par deploy (free)

1. Code GitHub par is branch me hai (`arena/f257d954-thegolfsentuary`) — repo me **`render.yaml`** already hai (blueprint)
2. https://dashboard.render.com → **Sign in with GitHub** → repo access do
3. **New + → Blueprint** → `TheGolfSentuary` repo select → branch select → **Apply**
   - render.yaml khud bana dega Web Service `sur-sangam-api`: Node 20, rootDir `server`, health `/health`
4. Blueprint ek env maangega: **MONGO_URI** → apni Atlas URI paste → **Apply**
   (CORS_ORIGIN + JWT_SECRET render.yaml me set hain)
5. ~4 min build → live URL: `https://sur-sangam-api.onrender.com`
6. Test: `https://sur-sangam-api.onrender.com/health` → `{"ok":true,"db":"MongoDB"}`
   (Free tier pehli baar me ~50s soya hoga — next se fast)

### Frontend ko Render API se jodna (optional, best)
Render par ek aur service: **New + → Static Site** → same repo, branch, build `npm install && npx vite build`, publish `dist`, env:
```
VITE_API_URL=https://sur-sangam-api.onrender.com
```
→ frontend search/playlists ab aapke **apne server** se jayenge (fast, DB, CORS proxy ki zaroorat nahi). Github Pages wala build direct Saavn hi use karta rahega (bina badlav ke).

### Free tier notes
- Web service ~15 min idle = so jata hai; pehla request 30-60s lagega. (Kam use = theek; chahiye to daily ping wala cron)
- Atlas M0: 512 MB — tracks cache, users, playlists ke liye kaafi (audio files DB me nahi, URL store hota hai)
- Render free me `render.yaml` change karne par auto-redeploy hota hai (push = deploy)

## Part D — Data model (kya-kya save hoga)
- **users**: naam, email, bcrypt-hash password, avatar, `likedSongs[]` (heart), plan, follow counts
- **tracks**: title/artist/album/cover/audioUrl/duration/`category[]`/source/plays — text index (title+artist+album) = instant search
- **playlists**: user ki banayi playlists (track refs), public/private

Routes: `/api/auth/signup`, `/api/auth/login`, `/api/search`, `/api/tracks`, `/api/trending`, `POST/GET /api/playlists` (Bearer JWT), `/health`
