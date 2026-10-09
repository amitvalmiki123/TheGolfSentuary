import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'sur-sangam-secret-2024'
const MONGO_URI = process.env.MONGO_URI || ''

// --- MongoDB ---
let dbReady = false
if (MONGO_URI) {
  mongoose.connect(MONGO_URI).then(()=>{
    console.log('✅ MongoDB connected:', mongoose.connection.name)
    dbReady = true
  }).catch(e=> console.error('MongoDB failed, running in memory mode:', e.message))
} else {
  console.log('⚠️  MONGO_URI not set — running in memory mode (Piped+Saavn proxy, no DB). Set MONGO_URI in .env for persistent DB.')
}

// Models (import after mongoose)
let Track, User, Playlist
if (MONGO_URI) {
  // dynamic import to avoid errors when mongoose not connected
  const t = await import('./models/Track.js').then(m=>m.default).catch(()=>null)
  const u = await import('./models/User.js').then(m=>m.default).catch(()=>null)
  const p = await import('./models/Playlist.js').then(m=>m.default).catch(()=>null)
  Track = t; User = u; Playlist = p
}

// --- Middleware ---
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true, credentials: true }))
app.use(express.json({ limit: '10mb' }))

// YouTube Music via Piped (free, no key) — our clone server
const PIPED_HOSTS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.leptos.at"
]
const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
]

// Cache in memory (5 min)
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000
const fallbackTracks = [
  { id: 'fallback-1', title: "Kesariya", artist: "Arijit Singh, Pritam", album: "Brahmāstra", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60", audio: "https://aac.saavncdn.com/232/...", durationLabel: "4:28", durationSec: 268, plays: "412M", color: "#C35445", source: 'Saavn • Full', category: ["Hindi","Love"] },
  { id: 'fallback-2', title: "Chaleya", artist: "Arijit Singh, Shilpa Rao", album: "Jawan", cover: "https://images.unsplash.com/photo-1500099817043-86d46000d58f?w=600&auto=format&fit=crop&q=60", audio: "https://aac.saavncdn.com/...", durationLabel: "3:21", color: "#6A418E", plays: "298M", source: 'Saavn • Full', category: ["Hindi"] },
]


// server-side fetch — NO CORS proxies needed (proxies are a browser thing; they only added latency here)
async function fetchJson(url, ms=2300){
  const ctrl = new AbortController()
  const tm = setTimeout(()=> ctrl.abort(), ms)
  try{
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'Accept':'application/json', 'User-Agent':'Mozilla/5.0 (SurSangam)' } })
    if(!r.ok) throw new Error(`http ${r.status}`)
    return JSON.parse(await r.text())
  } finally { clearTimeout(tm) }
}
function memoGet(key){
  const hit = cache.get(key)
  if(hit && Date.now() - hit.at < CACHE_TTL) return hit.val
  if(hit) cache.delete(key)
  return null
}
function memoSet(key, val){ try{ if(cache.size>500) cache.clear() }catch{}; cache.set(key, { at: Date.now(), val }) }

async function fetchWithCors(url, ms=4500){
  const attempts = [url, ...CORS_PROXIES.map(fn=>fn(url))]
  for(const u of attempts){
    try{
      const ctrl = new AbortController()
      const t = setTimeout(()=> ctrl.abort(), ms)
      const r = await fetch(u, { signal: ctrl.signal, headers: { 'Accept':'application/json' } })
      clearTimeout(t)
      if(!r.ok) throw new Error(`http ${r.status}`)
      const text = await r.text()
      let data
      try{
        data = JSON.parse(text)
        if(data && typeof data.contents === 'string'){
          try{ data = JSON.parse(data.contents) }catch{}
        }
      }catch{ throw new Error('invalid json') }
      return data
    }catch(e){ continue }
  }
  throw new Error('fetch failed')
}

function pickColor(){ const c=["#C35445","#6A418E","#A154D6","#543551","#572223","#D5AA55","#E9CDC2"]; return c[Math.floor(Math.random()*c.length)] }
function formatSec(s){ if(!s) return "3:30"; const sec=Number(s); if(isNaN(sec)) return "3:30"; return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}` }
function decodeStr(s){ if(!s) return s; try{ return decodeURIComponent(s).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#039;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>') }catch{ return s } }

async function searchPiped(query, limit=20, nextpage=null){
  const filters = ["music_songs"]
  for(const host of PIPED_HOSTS.slice(0,3)){
    for(const filter of filters){
      try{
        const filterParam = filter ? `&filter=${filter}` : ""
        const url = `${host}/search?q=${encodeURIComponent(query)}${filterParam}${nextpage? `&nextpage=${encodeURIComponent(nextpage)}`:''}`
        const data = await fetchJson(url, 2300)
        const items = data.items || data.content || []
        const streams = items.filter(i=>{
          if(!i.title || !(i.type==="stream" || i.type==="video" || i.url)) return false
          if(i.isLive || i.isShort) return false
          const dur = i.duration || 0
          if(dur && (dur < 60 || dur > 480)) return false
          const low = (i.title||"").toLowerCase()
          if(low.includes("live stream") || low.includes("gta 5") || low.includes("chulhe") || low.includes("cooking")) return false
          return true
        }).slice(0, limit)
        if(!streams.length) continue
        const mapped = streams.map(s=>{
          let videoId = null
          const u = s.url || ''
          if(u.includes('v=')) videoId = u.split('v=')[1]?.split('&')[0]
          else if(s.id) videoId = String(s.id)
          else if(u) videoId = u.split('/').pop()?.split('?')[0]
          if(!videoId) return null
          videoId = videoId.split('?')[0].split('&')[0]
          const title = s.title || "Unknown"
          const artist = s.uploaderName || s.uploader || "YouTube"
          const cover = s.thumbnail || s.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          const dur = s.duration || 0
          return {
            id: `piped-${videoId}`,
            videoId,
            title: decodeStr(title),
            artist,
            album: s.uploaderName || "YouTube",
            cover,
            audio: null,
            durationLabel: dur? formatSec(dur): "3:30",
            durationSec: dur|| 200,
            plays: s.views ? `${(s.views/1000000).toFixed(1)}M` : `${(Math.random()*500+80).toFixed(0)}M`,
            color: pickColor(),
            source: 'YouTube • Full',
            isPreview: false,
            category: ["Trending"]
          }
        }).filter(Boolean)
        if(mapped.length) return { tracks: mapped, nextpage: data.nextpage || null }
      }catch(e){ continue }
    }
  }
  return { tracks: [], nextpage: null }
}

const SAavn_ENDPOINTS = [
  (q, limit) => `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`,
  (q, limit) => `https://jiosaavn-api-privatecvc2.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`,
]

async function searchSaavn(query, limit=18){
  for(const buildUrl of SAavn_ENDPOINTS){
    try{
      const url = buildUrl(query, limit)
      const data = await fetchJson(url, 2600)
      let songs = []
      if(Array.isArray(data?.data?.results)) songs = data.data.results
      else if(Array.isArray(data?.data?.songs)) songs = data.data.songs
      else if(Array.isArray(data?.data)) songs = data.data
      else if(Array.isArray(data?.results)) songs = data.results
      else continue
      if(!songs.length) continue
      const mapped = songs.slice(0,limit).map(s=>{
        let img = null
        if(Array.isArray(s.image)) img = s.image[2]?.url || s.image[2]?.link || s.image[1]?.url
        else if(typeof s.image==='string') img=s.image
        let audio=null
        if(Array.isArray(s.downloadUrl)){
          const last=s.downloadUrl[s.downloadUrl.length-1]
          audio=last?.url || last?.link
        } else if(typeof s.downloadUrl==='string') audio=s.downloadUrl
        const title=decodeStr(s.name||s.title||"Unknown")
        const artistVal=s.artists?.primary?.map(a=>a.name).join(', ') || s.primaryArtists || "Unknown"
        const album=s.album?.name || "Single"
        const dur=Number(s.duration)||0
        const cat = s.language ? [s.language] : ["Hindi"]
        if(typeof audio==='string' && audio.startsWith('http') && !audio.includes('encrypted')){
          return { id:`saavn-${s.id}`, title, artist:artistVal, album, cover: img||`https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60`, audio, durationLabel: dur? formatSec(dur):"3:30", durationSec:dur||210, plays:`${(Math.random()*800+50).toFixed(0)}M`, color:pickColor(), source:'Saavn • Full', isPreview:false, category: cat }
        }
        return null
      }).filter(Boolean)
      if(mapped.length) return mapped
    }catch(e){ continue }
  }
  return []
}

// --- Auth helper ---
function auth(req,res,next){
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if(!token) return res.status(401).json({ error: 'No token' })
  try{
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  }catch{ res.status(401).json({ error: 'Invalid token' }) }
}

// --- Routes: Health & Clone ---
app.get('/health', (req,res)=> res.json({ ok:true, clone:'YouTube Music via Piped + Saavn', db: dbReady ? 'MongoDB' : 'memory', theme:'Sur Sangam #060306', time: new Date().toISOString() }))

app.get('/api/search', async (req,res)=>{
  const q = (req.query.q || '').toString().trim()
  const limit = Math.min(parseInt(req.query.limit||'24'), 40)
  const nextpage = req.query.nextpage || null
  if(!q) return res.json({ tracks: [], nextpage: null })
  const sk = `sr:${q.toLowerCase()}:${limit}`
  const smemo = memoGet(sk)
  if(smemo) return res.json(smemo)
  // Try DB first if ready
  if(dbReady && Track){
    try{
      let dbTracks = await Track.find({ $text: { $search: q } }).limit(limit).lean()
      if(!dbTracks.length){
        // $regex fallback (chhote DB ke liye fine) — title/artist/album teeno me, case-insensitive
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i')
        dbTracks = await Track.find({ $or:[{title:rx},{artist:rx},{album:rx}] }).limit(limit).lean()
      }
      if(dbTracks.length) return res.json({ tracks: dbTracks, nextpage: null, source: 'db' })
    }catch{}
  }
  // Live sources IN PARALLEL (Saavn priority for Indian) — faster + no sequential timeout waits
  const isIndian = /[\u0900-\u097F]|arijit|punjab|hindi|sidhu|diljit|love|90s|bollywood|anuv|singh|kaur|yo ?yo|honey|rafter|dhillon|gill|heera|waraam|bohra/i.test(q.toLowerCase())
  const [sr, pr] = await Promise.allSettled([ searchSaavn(q, isIndian? limit : 12), searchPiped(q, isIndian? 10 : limit) ])
  const sTr = sr.status==='fulfilled' ? (sr.value||[]) : []
  const pTr = pr.status==='fulfilled' ? ((pr.value&&pr.value.tracks)||[]) : []
  const seen = new Set(); let tracks = []
  for(const x of (isIndian? [...sTr, ...pTr] : [...pTr, ...sTr])){
    const k = ((x.title||'')+'|'+(x.artist||'')).toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g,'')
    if(!x.title || seen.has(k)) continue
    seen.add(k); tracks.push(x)
  }
  if(!tracks.length && process.env.ALLOW_FALLBACK==='1'){
    tracks = fallbackTracks.slice(0, limit)
  }
  const sout = { tracks: tracks.slice(0,limit), nextpage: null }
  if(sout.tracks.length) memoSet(sk, sout)
  res.json(sout)
})

// ── AUDIO PROXY: server pulls plain mp3 (invidious itag=140 / piped streams) and re-serves it
// same-origin with Range support. The APK plays THIS url in a bare <audio> element — no YouTube
// iframe, no visibility policy, seek works via Range passthrough. Free-tier egress friendly.
const INVID_HOSTS = [
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com'
]
app.get('/api/audiostream', async (req,res)=>{
  const vid = (req.query.vid||'').toString().trim().replace(/[^A-Za-z0-9_-]/g,'').slice(0,20)
  if(!vid) return res.status(400).json({ error:'vid required' })
  const range = req.headers.range || null
  const tried = []
  const tryFetch = async (url) => {
    const ctrl = new AbortController(); const tm = setTimeout(()=>ctrl.abort(), 14000)
    try{
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent':'Mozilla/5.0', ...(range?{Range:range}:{}) }, redirect:'follow' })
      clearTimeout(tm)
      return r
    }catch(e){ clearTimeout(tm); return null }
  }
  for(const h of INVID_HOSTS){
    tried.push(h)
    const r = await tryFetch(`${h}/latest_version?id=${vid}&local=true&itag=140`)
    if(r && (r.status===200 || r.status===206) && r.body){
      res.setHeader('Access-Control-Allow-Origin','*')
      res.status(r.status)
      res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mp4')
      res.setHeader('Accept-Ranges','bytes')
      const cl = r.headers.get('content-length'); if(cl) res.setHeader('Content-Length', cl)
      const cr = r.headers.get('content-range'); if(cr) res.setHeader('Content-Range', cr)
      const reader = r.body.getReader()
      try{
        for(;;){ const {done, value} = await reader.read(); if(done) break; if(!res.write(value)) await new Promise(ok=>res.once('drain',ok)) }
      }catch(e){}
      return res.end()
    }
    if(r) try{ r.body && r.body.cancel && r.body.cancel() }catch(e){}
  }
  // fallback: piped /streams direct URL → fetch server-side and pipe
  for(const h of PIPED_HOSTS.slice(0,3)){
    const r = await tryFetch(`${h}/streams/${vid}`)
    if(!r || !r.ok){ continue }
    try{
      const data = await r.json()
      const a = (data.audioStreams||[]).filter(x=>x&&x.url)
      const best = a.find(x=>String(x.mimeType||'').includes('mp4')) || a[0]
      if(best){
        const s2 = await tryFetch(best.url)
        if(s2 && (s2.status===200||s2.status===206) && s2.body){
          res.setHeader('Access-Control-Allow-Origin','*')
          res.status(s2.status)
          res.setHeader('Content-Type', s2.headers.get('content-type') || 'audio/mp4')
          res.setHeader('Accept-Ranges','bytes')
          const cl2 = s2.headers.get('content-length'); if(cl2) res.setHeader('Content-Length', cl2)
          const cr2 = s2.headers.get('content-range'); if(cr2) res.setHeader('Content-Range', cr2)
          const reader2 = s2.body.getReader()
          try{
            for(;;){ const {done, value} = await reader2.read(); if(done) break; if(!res.write(value)) await new Promise(ok=>res.once('drain',ok)) }
          }catch(e){}
          return res.end()
        }
      }
    }catch(e){}
  }
  // last resort: resolve via piped and 302 the CLIENT straight to the stream url (device-side
  // load avoids proxying bytes through a free tier)
  for(const h of PIPED_HOSTS.slice(0,3)){
    try{
      const rr = await fetch(`${h}/streams/${vid}`, { headers:{ 'User-Agent':'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) })
      if(!rr.ok) continue
      const dd = await rr.json()
      const aa = (dd.audioStreams||[]).filter(x=>x&&x.url)
      const bb = aa.find(x=>String(x.mimeType||'').includes('mp4')) || aa[0]
      if(bb) return res.redirect(302, bb.url)
      if(dd.hls) return res.redirect(302, dd.hls)
    }catch(e){}
  }
  res.status(502).json({ error:'no working upstream', tried })
})

app.get('/api/audiourl', async (req,res)=>{
  // videoId → best audio stream URL (Piped instances, tried server-side; the APK then plays
  // the mp3 in a plain <audio> element → no YouTube iframe policy → survives minimize/lock).
  const vid = (req.query.vid||'').toString().trim().replace(/[^A-Za-z0-9_-]/g,'').slice(0,20)
  if(!vid) return res.json({ url:null })
  // Prefer our own proxy url: same-origin, no IP-binding, seek via Range.
  const proto = (req.get('x-forwarded-proto')||'').split(',')[0].trim() || (req.headers.host && req.headers.host.includes('onrender.com') ? 'https' : req.protocol)
  return res.json({ url: `${proto}://${req.get('host')}/api/audiostream?vid=${vid}`, proxy:true })
  const ak = `au:${vid}`
  const hit = memoGet(ak)
  if(hit) return res.json(hit)
  const hosts = [...new Set([req.query.host, ...PIPED_HOSTS].filter(Boolean))]
  const ctl = new AbortController(); const tm = setTimeout(()=>ctl.abort(), 12000)
  for(const host of hosts.slice(0,4)){
    try{
      const r = await fetch(`${host}/streams/${vid}`, { signal: ctl.signal, headers: { 'User-Agent':'Mozilla/5.0' } })
      if(!r.ok) continue
      const data = await r.json()
      const a = (data.audioStreams||[]).filter(x=>x&&x.url)
      const best = a.find(x=>String(x.mimeType||'').includes('mp4')) || a.find(x=>String(x.mimeType||'').includes('webm')) || a[0]
      const url = best ? best.url : (data.hls||null)
      if(url){ clearTimeout(tm); const out={ url }; memoSet(ak, out); return res.json(out) }
    }catch(e){ continue }
  }
  clearTimeout(tm)
  res.json({ url:null })
})

app.get('/api/tracks', async (req,res)=>{
  const cat = (req.query.category || 'All').toString()
  const limit = Math.min(parseInt(req.query.limit||'20'), 40)
  const ck = `tk:${cat}:${limit}`
  const memo = memoGet(ck)
  if(memo) return res.json(memo)
  if(dbReady && Track){
    try{
      const filter = cat==='All' ? {} : { category: cat }
      const dbTracks = await Track.find(filter).limit(limit).lean()
      if(dbTracks.length) return res.json({ tracks: dbTracks })
    }catch{}
  }
  // Live fallback
  const qmap = {
    Punjabi: "Punjabi hit songs Sidhu Moose Wala",
    Hindi: "Hindi hit songs Arijit Singh",
    Love: "Romantic Hindi songs",
    "90s": "90s Hindi hits Kumar Sanu",
    Bollywood: "Bollywood hits Pritam",
    Indie: "Indie Anuv Jain",
    Trending: "Trending India",
    All: "Top songs India"
  }
  const q = qmap[cat] || cat
  // Saavn pehle (CDN Mumbai, ~300-600ms), Piped sirf supplement (wo host dead hone pe 2s waste karta tha)
  let tracks = await searchSaavn(q, limit).catch(()=>[])
  if(tracks.length < 6){
    const p = await searchPiped(q, Math.max(12, limit - tracks.length)).catch(()=>({tracks:[]}))
    tracks = [...tracks, ...(p.tracks||[])]
  }
  if(!tracks.length && process.env.ALLOW_FALLBACK==='1'){
    tracks = fallbackTracks.filter(t=> cat==='All' || (t.category||[]).includes(cat)).slice(0, limit)
    if(!tracks.length) tracks = fallbackTracks.slice(0, limit)
  }
  const out = { tracks: tracks.slice(0,limit) }
  if(out.tracks.length) memoSet(ck, out)
  res.json(out)
})

app.post('/api/playlists', auth, async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready — set MONGO_URI' })
  const { name, trackIds } = req.body
  if(!name) return res.status(400).json({ error: 'name required' })
  const pl = await Playlist.create({ name, userId: req.user.id, tracks: trackIds||[], cover: `https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60&random=${Date.now()}` })
  res.json(pl)
})

app.get('/api/playlists', auth, async (req,res)=>{
  if(!dbReady) return res.json([])
  const pls = await Playlist.find({ userId: req.user.id }).populate('tracks').lean()
  res.json(pls)
})

app.post('/api/auth/signup', async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready' })
  const { name, email, password } = req.body
  if(!email || !password) return res.status(400).json({ error: 'email/password required' })
  const hash = await bcrypt.hash(password, 10)
  try{
    const u = await User.create({ name, email, passwordHash: hash, avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name||email)}` })
    const token = jwt.sign({ id: u._id, email: u.email, name: u.name }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, user: { id: u._id, name: u.name, email: u.email, avatar: u.avatar } })
  }catch(e){ res.status(400).json({ error: e.message }) }
})

app.post('/api/auth/login', async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready' })
  const { email, password } = req.body
  const u = await User.findOne({ email })
  if(!u) return res.status(401).json({ error: 'Invalid credentials' })
  const ok = await bcrypt.compare(password, u.passwordHash)
  if(!ok) return res.status(401).json({ error: 'Invalid credentials' })
  const token = jwt.sign({ id: u._id, email: u.email, name: u.name }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: { id: u._id, name: u.name, email: u.email, avatar: u.avatar } })
})

// Add own/hosted tracks to DB (apne S3/Cloudinary MP3 URL yahan save karo)
app.post('/api/tracks', auth, async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready — set MONGO_URI' })
  try{
    const body = req.body
    const docs = Array.isArray(body) ? body : [body]
    const cleaned = docs.filter(d=> d && d.title && d.artist && d.audioUrl).map(d=>({
      title: String(d.title), artist: String(d.artist), album: d.album||'Single',
      cover: d.cover||'', audioUrl: String(d.audioUrl), duration: Number(d.duration)||0,
      durationLabel: d.durationLabel || formatSec(Number(d.duration)||0),
      category: Array.isArray(d.category)? d.category : [d.category||'Hindi'],
      source: d.source||'Own', color: pickColor(), plays: d.plays||'0'
    }))
    if(!cleaned.length) return res.status(400).json({ error: 'title/artist/audioUrl required' })
    const inserted = await Track.insertMany(cleaned)
    res.status(201).json({ added: inserted.length, tracks: inserted })
  }catch(e){ res.status(500).json({ error: e.message }) }
})

// ---- Session restore ----
app.get('/api/auth/me', auth, async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready' })
  try{
    const u = await User.findById(req.user.id).lean()
    if(!u) return res.status(404).json({ error: 'no user' })
    res.json({ user: { id: String(u._id), name: u.name, email: u.email, avatar: u.avatar, plan: u.plan || 'Free', bio: u.bio || '' } })
  }catch(e){ res.status(400).json({ error: 'invalid token' }) }
})

app.delete('/api/auth/me', auth, async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready' })
  await User.findByIdAndDelete(req.user.id)
  res.json({ ok: true })
})

// ---- Liked songs (cloud) ----
app.get('/api/likes', auth, async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready' })
  const u = await User.findById(req.user.id).select('likedMeta').lean()
  res.json({ tracks: u?.likedMeta || [] })
})
app.put('/api/likes', auth, async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready' })
  const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks.filter(x=>x&&x.tid).slice(0,1500) : []
  await User.findByIdAndUpdate(req.user.id, { likedMeta: tracks })
  res.json({ ok: true, count: tracks.length })
})

// ---- Playlists (cloud sync, client shape) ----
app.get('/api/playlists/sync', auth, async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready' })
  const u = await User.findById(req.user.id).select('rawPlaylists').lean()
  res.json({ playlists: u?.rawPlaylists || [] })
})
app.post('/api/playlists/sync', auth, async (req,res)=>{
  if(!dbReady) return res.status(503).json({ error: 'DB not ready' })
  const pls = Array.isArray(req.body?.playlists) ? req.body.playlists.filter(x=>x&&x.id).slice(0,200) : []
  await User.findByIdAndUpdate(req.user.id, { rawPlaylists: pls })
  res.json({ ok: true, count: pls.length })
})

// Keep existing YT Music clone routes for backward compat
app.get('/api/trending', async (req,res)=>{
  const cat = (req.query.cat||'Trending').toString()
  const limit = Math.min(parseInt(req.query.limit||'24'), 40)
  const qmap = { Punjabi: "Punjabi hit songs", Hindi: "Hindi hit songs", Love: "Romantic Hindi songs", "90s": "90s Hindi hits", Bollywood: "Bollywood hits", Indie: "Indie Anuv Jain", Trending: "Trending India", All: "Top songs India" }
  const q = qmap[cat] || cat
  const s = await searchSaavn(q, limit).catch(()=>[])
  if(s.length >= 6) return res.json({ tracks: s.slice(0,limit), nextpage: null, cat })
  const p = await searchPiped(q, limit).catch(()=>({tracks:[]}))
  res.json({ tracks: (p.tracks||[]).slice(0,limit), nextpage: p.nextpage||null, cat })
})

app.get('/', (req,res)=>{
  res.type('html').send(`
    <h1>Sur Sangam — Server</h1>
    <p>Theme #060306 | DB: ${dbReady ? 'MongoDB' : 'memory (set MONGO_URI)'} | Clone: YouTube Music + Saavn</p>
    <ul>
      <li><a href="/health">/health</a></li>
      <li><a href="/api/search?q=Arijit&limit=5">/api/search?q=Arijit</a></li>
      <li><a href="/api/tracks?category=Punjabi&limit=5">/api/tracks?category=Punjabi</a></li>
      <li>POST /api/auth/signup {name,email,password}</li>
      <li>POST /api/playlists (Bearer token)</li>
    </ul>
  `)
})

app.listen(PORT, '0.0.0.0', ()=> console.log(`✅ Sur Sangam server LIVE on http://0.0.0.0:${PORT} — DB: ${dbReady?'MongoDB':'memory'}`))
