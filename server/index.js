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
  for(const host of PIPED_HOSTS){
    for(const filter of filters){
      try{
        const filterParam = filter ? `&filter=${filter}` : ""
        const url = `${host}/search?q=${encodeURIComponent(query)}${filterParam}${nextpage? `&nextpage=${encodeURIComponent(nextpage)}`:''}`
        const data = await fetchWithCors(url, 4000)
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
      const data = await fetchWithCors(url, 3500)
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
  // Try DB first if ready
  if(dbReady && Track){
    try{
      const dbTracks = await Track.find({ $text: { $search: q } }).limit(limit).lean()
      if(dbTracks.length) return res.json({ tracks: dbTracks, nextpage: null, source: 'db' })
    }catch{}
  }
  // Fallback to live proxy (Saavn-first for Indian)
  const isIndian = /[\u0900-\u097F]|arijit|punjab|hindi|sidhu|diljit|love|90s|bollywood|anuv/i.test(q.toLowerCase())
  let tracks = []
  if(isIndian){
    const s = await searchSaavn(q, limit).catch(()=>[])
    tracks = s
    if(tracks.length < 12){
      const p = await searchPiped(q, limit - tracks.length).catch(()=>({tracks:[]}))
      tracks = [...tracks, ...(p.tracks||[])]
    }
  } else {
    const p = await searchPiped(q, limit).catch(()=>({tracks:[]}))
    tracks = p.tracks || []
    if(tracks.length < 12){
      const s = await searchSaavn(q, 12).catch(()=>[])
      tracks = [...tracks, ...s]
    }
  }
  if(!tracks.length && process.env.ALLOW_FALLBACK==='1'){
    tracks = fallbackTracks.slice(0, limit)
  }
  res.json({ tracks: tracks.slice(0,limit), nextpage: null })
})

app.get('/api/tracks', async (req,res)=>{
  const cat = (req.query.category || 'All').toString()
  const limit = Math.min(parseInt(req.query.limit||'20'), 40)
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
  const isIndianCat = ["Punjabi","Hindi","Love","90s","Bollywood","Indie"].includes(cat)
  let tracks = []
  if(isIndianCat){
    tracks = await searchSaavn(q, limit).catch(()=>[])
    if(tracks.length < 8){
      const p = await searchPiped(q, 12).catch(()=>({tracks:[]}))
      tracks = [...tracks, ...(p.tracks||[])]
    }
  } else {
    const p = await searchPiped(q, limit).catch(()=>({tracks:[]}))
    tracks = p.tracks || []
  }
  if(!tracks.length && process.env.ALLOW_FALLBACK==='1'){
    tracks = fallbackTracks.filter(t=> cat==='All' || (t.category||[]).includes(cat)).slice(0, limit)
    if(!tracks.length) tracks = fallbackTracks.slice(0, limit)
  }
  res.json({ tracks: tracks.slice(0,limit) })
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
