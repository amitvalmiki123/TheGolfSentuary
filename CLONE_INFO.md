# Sur Sangam — YouTube Music Clone Server

## Clone: YouTube Music (worldwide, free, no key)
- Server: `server/index.js` — Express + Piped (YouTube Music) — 5 min cache
- Frontend theme: Sur Sangam #060306 (aapka control)
- Backend control: categories, search, artist, stream — sab clone server se

## Endpoints
- GET /api/search?q=Anuv Jain&limit=24&nextpage=...
- GET /api/trending?cat=Punjabi&limit=24
- GET /api/artist/Anuv Jain?limit=24
- GET /api/stream/:videoId

## Run
- Server: cd server && npm install && npm start (http://localhost:3001)
- Frontend: npm run dev (vite proxy /api -> 3001)
- Prod: set VITE_API_URL=https://your-render-url.onrender.com

## Control
- Theme/settings/frontend: aapka — src/App.jsx, tailwind, vite
- Backend: server/index.js — hosts, cache, filters (music_songs only)

## Deploy
- Server to Render/Railway/Vercel (Node)
- Frontend to GitHub Pages (already live)
