# Sur Sangam — Backend (Node + Express + MongoDB)

Spotify/JioSaavn jaisa app ka backend — **2 modes**:

## 1. Memory mode (zero setup, abhi ready)
```bash
cd server
npm install
npm run dev        # http://localhost:3001
```
- `MONGO_URI` na ho to server **proxy-only** chalta hai: `/api/search` + `/api/tracks` live JioSaavn (saavn.dev) + Piped (YouTube Music `music_songs`) se genuine full-length tracks laata hai.
- Frontend (`src/lib/api.js`) dev mode me pehle `/api/...` try karta hai (vite proxy), fail/empty pe direct Saavn/Piped — **kabhi empty nahi**.
- `ALLOW_FALLBACK=1` env se server demo tracks bhi de sakta hai (testing ke liye; prod me OFF rakho).

## 2. Full DB mode (users, liked songs, playlists — persistent)
1. **MongoDB Atlas** (free 512 MB): https://cloud.mongodb.com → M0 cluster → Database User banao → **Copy connection string** → `MONGO_URI` me daalo
2. ```bash
   cd server
   cp .env.example .env      # MONGO_URI + JWT_SECRET bharo
   npm run dev
   ```
   Console me `✅ MongoDB connected: sur-sangam` dikhega.

### Routes
| Method | Route | Kya karta hai |
|---|---|---|
| GET | `/health` | status + DB mode |
| GET | `/api/search?q=Arijit&limit=24` | DB text-index → miss pe live Saavn-first (Indian) / Piped (global) |
| GET | `/api/tracks?category=Punjabi&limit=20` | category DB → live specific (Punjabi/Hindi/Love/90s/Bollywood/Indie) |
| POST | `/api/auth/signup` `{name,email,password}` | bcrypt hash + JWT (30d) |
| POST | `/api/auth/login` `{email,password}` | JWT token |
| POST | `/api/playlists` 🔒 `{name,trackIds}` | user ki playlist (Bearer token) |
| GET | `/api/playlists` 🔒 | meri playlists (populate tracks) |

Collections: **tracks** (text index title/artist/album + category[]), **users** (likedSongs[]), **playlists** (tracks[]).

## Deploy (free)
- **Render/Railway**: New Web Service → root `server/` → `npm run dev` start → env: `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGIN=https://amitvalmiki123.github.io`
- Frontend prod me apna backend point karne ke liye: build se pehle `VITE_API_URL=https://sur-sangam.onrender.com` set karo — phir frontend DB+cache search use karega (faster than direct, JioSaavn级).

## Apne MP3 host karna (baad me)
Abhi audio URLs **Saavn CDN (aac.saavncdn.com)** + YouTube se hain — $0, unlimited.
Khud ke gaane: S3/Cloudinary pe upload → `Track` doc ka `audioUrl` update → frontend ko wahi URL mil jayega. (`AWS_S3_BUCKET` env reserved hai.)
