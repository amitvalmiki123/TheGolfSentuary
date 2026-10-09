// YouTube Music-like — Piped (YouTube) primary with Invidious fallback, Saavn for Indian, Audius for global
const PIPED_HOSTS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.leptos.at"
]
const INVIDIOUS_HOSTS = [
  "https://inv.nadeko.net",
  "https://invidious.snopyta.org",
  "https://yewtu.be",
  "https://inv.tux.pizza"
]
const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://yacdn.org/proxy/${url}`,
  (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
]
const BACKEND_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ? import.meta.env.VITE_API_URL : ''
// Try backend first (if running), fallback to direct Piped/Saavn — works in memory mode too
const SAavn_ENDPOINTS = [
  (q, limit) => `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`,
  (q, limit) => `https://jiosaavn-api-privatecvc2.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`,
  (q, limit) => `https://jiosaavn-api-with-cors.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`,
]

async function fetchJsonWithCors(url, ms=4500){
  const attempts = [url, ...CORS_PROXIES.map(fn=> fn(url))]
  const tryOne = async (u)=>{
    const ctrl = new AbortController()
    const t = setTimeout(()=> ctrl.abort(), ms)
    try{
      const r = await fetch(u, { signal: ctrl.signal, headers: { 'Accept':'application/json' } })
      if(!r.ok) throw new Error(`http ${r.status}`)
      const text = await r.text()
      let data
      try{
        data = JSON.parse(text)
        if(data && typeof data.contents === 'string'){
          try{ data = JSON.parse(data.contents) }catch{}
        }
      }catch(e){ throw new Error('invalid json') }
      if(data === null || data === undefined) throw new Error('empty')
      return data
    } finally { clearTimeout(t) }
  }
  // RACE all paths — first valid JSON wins (dead proxy no longer blocks everyone else)
  return Promise.any(attempts.map(tryOne))
}

// ---------- Piped: YouTube ----------
export async function searchPiped(query, limit=20, nextpage=null){
  // Strict YouTube Music: only music_songs (prevents GTA/cooking live streams)
  // ALL HOSTS RACED IN PARALLEL — pehle host dead ho to 4×4s wait nahi, ~3s me kisi bhi host se data
  const q = encodeURIComponent(query)
  const np = nextpage ? `&nextpage=${encodeURIComponent(nextpage)}` : ''
  let data = null, host = ''
  try{
    const winner = await Promise.any(PIPED_HOSTS.map(h=> fetchJsonWithCors(`${h}/search?q=${q}&filter=music_songs${np}`, 2800).then(d=>{
      const items = (d && (d.items || d.content)) || []
      if(!Array.isArray(items) || !items.length) throw new Error('empty')
      return { d, host: h }
    })))
    data = winner.d; host = winner.host
  }catch(e){ return { tracks: [], nextpage: null } }
  const items = data.items || data.content || []
  const streams = items.filter(i=>{
    if(!i.title || !(i.type==="stream" || i.type==="video" || i.url)) return false
    if(i.isLive || i.isShort) return false
    const dur = i.duration || 0
    if(dur && (dur < 60 || dur > 480)) return false // music 1-8 min only
    const low = (i.title||"").toLowerCase()
    if(low.includes("live stream") || low.includes("gta 5") || low.includes("chulhe") || low.includes("cooking") || low.includes("gameplay")) return false
    return true
  }).slice(0, limit)
  if(!streams.length) return { tracks: [], nextpage: null }
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
      title: decode(title),
      artist,
      album: s.uploaderName || "YouTube",
      cover,
      audio: null, // will be played via YouTube IFrame (no googlevideo needed)
      durationLabel: dur? formatSec(dur): "3:30",
      durationSec: dur|| 200,
      plays: s.views ? `${(s.views/1000000).toFixed(1)}M` : "",
      color: pickColor(),
      source: 'YouTube • Full',
      isPreview: false,
      original: s,
      host
    }
  }).filter(Boolean)
  return { tracks: mapped, nextpage: data.nextpage || null }
}

// Invidious fallback (if Piped completely down)
export async function searchInvidious(query, limit=20){
  // fast timeout 4000
  for(const host of INVIDIOUS_HOSTS){
    try{
      const data = await fetchJsonWithCors(`${host}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`, 4000)
      if(!Array.isArray(data) || !data.length) continue
      const mapped = data.slice(0, limit).map(v=>{
        const videoId = v.videoId || v.video_id
        if(!videoId) return null
        return {
          id: `inv-${videoId}`,
          videoId,
          title: decode(v.title||"Unknown"),
          artist: v.author || "YouTube",
          album: v.author || "YouTube",
          cover: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          audio: null,
          durationLabel: formatSec(v.lengthSeconds||0),
          durationSec: v.lengthSeconds||200,
          plays: v.viewCount? `${(v.viewCount/1000000).toFixed(1)}M` : `${(Math.random()*400).toFixed(0)}M`,
          color: pickColor(),
          source: 'YouTube • Full',
          isPreview: false,
          original: v,
          host
        }
      }).filter(Boolean)
      if(mapped.length) return { tracks: mapped, nextpage: null }
    }catch(e){ continue }
  }
  return { tracks: [], nextpage: null }
}

// Resolve to direct googlevideo url (only for audio-element fallback, YT player doesn't need it)
export async function resolvePipedAudio(track){
  if(track.audio && track.audio.startsWith('http')) return track.audio
  if(!track.videoId) return null
  const hosts = track.host ? [track.host, ...PIPED_HOSTS.filter(h=> h!==track.host)] : PIPED_HOSTS
  for(const host of hosts){
    try{
      const data = await fetchJsonWithCors(`${host}/streams/${track.videoId}`, 7000)
      const audioStreams = data.audioStreams || []
      const best = audioStreams.find(a=> a.mimeType?.includes('mp4') && a.url) || audioStreams.find(a=> a.url && a.mimeType?.includes('webm')) || audioStreams.find(a=> a.url)
      if(best?.url) return best.url
      if(data.hls) return data.hls
    }catch(e){ continue }
  }
  return null
}

export async function searchSaavn(query, limit=18){
  for(const buildUrl of SAavn_ENDPOINTS){
    try{
      const url = buildUrl(query, limit)
      const data = await fetchJsonWithCors(url, 3800)
      let songs = []
      if(Array.isArray(data?.data?.results)) songs = data.data.results
      else if(Array.isArray(data?.data?.songs)) songs = data.data.songs
      else if(Array.isArray(data?.data)) songs = data.data
      else if(Array.isArray(data?.results)) songs = data.results
      else if(Array.isArray(data?.songs)) songs = data.songs
      else if(Array.isArray(data)) songs = data
      else if(data?.data && typeof data.data==='object' && data.data.id) songs=[data.data]
      else continue
      if(!songs.length) continue
      const mapped = songs.slice(0,limit).map(s=>{
        let img = null
        if(Array.isArray(s.image)) img = s.image[2]?.url || s.image[2]?.link || s.image[1]?.url || s.image[1]?.link || s.image[0]?.url || s.image[0]?.link
        else if(typeof s.image==='string') img=s.image
        else if(s.image?.url) img=s.image.url
        else if(s.image?.link) img=s.image.link
        let audio=null
        if(Array.isArray(s.downloadUrl)){
          const last=s.downloadUrl[s.downloadUrl.length-1]
          audio=last?.url || last?.link || s.downloadUrl.find(x=> x.url||x.link)?.url || s.downloadUrl.find(x=> x.url||x.link)?.link
        } else if(typeof s.downloadUrl==='string') audio=s.downloadUrl
        else if(s.download_url) audio=s.download_url
        else if(s.url) audio=s.url
        const title=decode(s.name||s.title||s.song||"Unknown")
        const artistVal=s.artists?.primary?.map(a=>a.name).join(', ') || s.primaryArtists || s.artist || s.singers || "Unknown"
        const album=s.album?.name || (typeof s.album==='string'? s.album:null) || s.albumName || "Single"
        const dur=Number(s.duration)||Number(s.playTime)||Number(s.more_info?.duration)||0
        if(typeof audio==='string' && audio.startsWith('http') && !audio.includes('encrypted')){
          return { id:`saavn-${s.id||title}-${Math.random().toString(36).slice(2,5)}`, title, artist:artistVal, album, cover: typeof img==='string'? img: img||"https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60", audio, durationLabel: dur? formatSec(dur):"3:30", durationSec:dur||210, plays:`${(Math.random()*800+50).toFixed(0)}M`, color:pickColor(), source:'Saavn • Full', isPreview:false, language:String(s.language||'').toLowerCase(), original:s, videoId:null }
        }
        return null
      }).filter(Boolean).filter(x=> x.audio && x.audio.startsWith('http'))
      if(mapped.length) return mapped
    }catch(e){ continue }
  }
  return []
}


// ---------- LIVE SUGGESTIONS + STRICT RELEVANCE (YouTube-style search UX) ----------
let _lastSearchNextpage = null
export const getLastSearchNextpage = () => _lastSearchNextpage

export async function searchSuggestions(query){
  const q = String(query||'').trim()
  if(q.length < 2) return []
  const hosts = ["https://pipedapi.kavin.rocks","https://pipedapi.adminforge.de","https://pipedapi.leptos.at"]
  for(const h of hosts){
    try{
      const data = await fetchJsonWithCors(`${h}/suggest?search=${encodeURIComponent(q)}`, 1800)
      if(Array.isArray(data) && data.length){
        return [...new Set(data.map(x=> String(x).trim()).filter(Boolean))].slice(0, 8)
      }
    }catch(e){ }
  }
  try{
    const songs = await searchSaavn(q, 8)
    const seen = new Set(); const out = []
    for(const t of songs){ const s = t.title; if(s && !seen.has(s.toLowerCase())){ seen.add(s.toLowerCase()); out.push(s) } if(out.length>=6) break }
    return out
  }catch(e){ return [] }
}

export function rankByRelevance(tracks, query){
  const toks = String(query||'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t=> t.length>=2)
  if(!toks.length || !tracks || !tracks.length) return tracks || []
  const qlow = String(query||'').toLowerCase().trim()
  const scored = tracks.map(function(x){
    const title = String(x.title||'').toLowerCase()
    const artist = String(x.artist||'').toLowerCase()
    const album = String(x.album||'').toLowerCase()
    let score = 0
    for(const tok of toks){
      if(artist.includes(tok)) score += 4
      if(title.includes(tok)) score += 2
      if(album.includes(tok)) score += 1
    }
    if(title === qlow) score += 4
    if(artist.includes(qlow)) score += 3
    return { t: x, score: score, max: toks.length*5+7 }
  })
  scored.sort(function(a,b){ return b.score - a.score })
  const strong = scored.filter(function(x){ return x.score >= x.max*0.5 }).map(function(x){ return x.t })
  if(strong.length >= 8) return strong
  if(strong.length >= 3){
    const rest = scored.filter(function(x){ return x.score < x.max*0.5 }).map(function(x){ return x.t })
    return strong.concat(rest)
  }
  return scored.map(function(x){ return x.t })
}

const LANG_EXPECT = { Punjabi:'punjabi', Hindi:'hindi', Bollywood:'hindi' }
function strictByCategory(tracks, cat){
  const want = LANG_EXPECT[cat]
  if(!want || !tracks || !tracks.length) return tracks
  const m = tracks.filter(function(t){
    const lang = String(t.language||'').toLowerCase()
    if(lang.includes(want)) return true
    if(want==='punjabi'){
      return /[\u0A00-\u0A7F]/.test(String(t.title||'')) || /(sidhu|moose wala|diljit|aujla|shubh|ap dhillon|karoran|waraam|heera|bohra|intense|gill|kaur)/i.test(String(t.artist||''))
    }
    return false
  })
  return m.length >= 8 ? m : tracks
}


// ---------- REAL LYRICS (LRCLIB — synced LRC when available, never dummy) ----------
export async function fetchLyrics(track){
  if(!track || !track.title) return null
  const clean = s=> String(s||'').replace(/\s*[\(\[|].*?[\)\]]\s*/g,' ').replace(/\b(official|lyrics?|video|audio|visualizer|full ?song|mv|hd|4k|audio jit\.)\b/gi,' ').replace(/\s+/g,' ').trim()
  const name = clean(track.title)
  const artist = clean(String(track.artist||'').split(/[,&]|feat\.?|ft\.?/i)[0])
  if(!name || !artist) return null
  let data = null
  try{ data = await fetchJsonWithCors(`https://lrclib.net/api/search?track_name=${encodeURIComponent(name)}&artist_name=${encodeURIComponent(artist)}`, 3400) }catch(e){ return null }
  const arr = Array.isArray(data) ? data : []
  if(!arr.length) return null
  const dsec = Number(track.durationSec)||0
  arr.sort(function(a,b){
    const sa = (a.syncedLyrics?2:0) + (a.duration && dsec && Math.abs(a.duration-dsec)<25 ?1:0)
    const sb = (b.syncedLyrics?2:0) + (b.duration && dsec && Math.abs(b.duration-dsec)<25 ?1:0)
    return sb-sa
  })
  const pick = arr.find(function(x){ return x.syncedLyrics }) || arr.find(function(x){ return x.plainLyrics }) || arr[0]
  if(pick && pick.syncedLyrics){
    const lines = []
    for(const raw of String(pick.syncedLyrics).split('\n')){
      const m = raw.match(/\[(\d+):(\d+)(?:[.:](\d{1,3}))?\]\s*(.*)/)
      if(!m) continue
      const frac = m[3] ? Number('0.'+m[3]) : 0
      const t = Number(m[1])*60 + Number(m[2]) + frac
      const txt = m[4].trim()
      if(txt) lines.push({ t, text: txt })
    }
    if(lines.length >= 5) return { synced:true, lines }
  }
  const plain = String((pick&&pick.plainLyrics)||'').split('\n').map(s=>s.trim()).filter(s=> s && !/^\[.*\]$/.test(s))
  if(plain.length >= 4) return { synced:false, lines: plain.map(text=>({ text })) }
  return null
}

export async function searchAudius(query, limit=10, offset=0){
  const hosts=["https://api.audius.co","https://discoveryprovider.audius.co","https://discoveryprovider2.audius.co"]
  for(const host of hosts){
    try{
      const data=await fetchJsonWithCors(`${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=SUR_SANGAM&limit=${limit}&offset=${offset}`,3800)
      const tracks=data?.data||[]
      if(!tracks.length) continue
      return tracks.filter(t=> t.is_streamable!==false).map(t=>{
        const art=t.artwork?.['1000x1000']||t.artwork?.['480x480']||t.artwork?.['150x150']
        return { id:`audius-${t.id}`, title:t.title, artist:t.user?.name||"Audius", album:t.user?.name||"Audius", cover:art||"https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60", audio:`${host}/v1/tracks/${t.id}/stream?app_name=SUR_SANGAM`, durationLabel:formatSec(t.duration), durationSec:t.duration||200, plays:`${((t.play_count||0)/1000000).toFixed(1)}M`, color:pickColor(), source:'Audius • Full', isPreview:false, original:t, videoId:null }
      })
    }catch(e){ continue }
  }
  return []
}

export async function searchITunes(query, limit=6){
  try{
    const data=await fetchJsonWithCors(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=${limit}&entity=song`,6000)
    return (data.results||[]).map(r=> ({ id:`itunes-${r.trackId}`, title:r.trackName, artist:r.artistName, album:r.collectionName||r.artistName, cover:r.artworkUrl100?.replace('100x100','600x600')||r.artworkUrl60, audio:r.previewUrl, durationLabel:formatMs(r.trackTimeMillis), durationSec:Math.floor((r.trackTimeMillis||30000)/1000), plays:`${(Math.random()*900+100).toFixed(0)}M`, color:pickColor(), source:'iTunes • Preview 0:30', isPreview:true, original:r, videoId:null }))
  }catch(e){ return [] }
}

// Unified search — Genuine full only (Spotify/Resso style): Piped+Invidious+Saavn primary, iTunes preview only as last resort and filtered out if full exists
export async function unifiedSearch(query, limit=24, offset=0){
  _lastSearchNextpage = null
  if(!query.trim()) return []
  // Try backend (MongoDB + Saavn/Piped proxy) first — like JioSaavn/Gaana
  if(BACKEND_URL || SELF_HOSTED || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)){
    try{
      const base = BACKEND_URL ? `${BACKEND_URL}/api/search` : `/api/search`
      const ac = new AbortController(); const tm = setTimeout(()=> ac.abort(), 2400)
      const r = await fetch(`${base}?q=${encodeURIComponent(query)}&limit=${limit}`, { headers: { 'Accept':'application/json' }, signal: ac.signal })
      clearTimeout(tm)
      if(r.ok){
        const data = await r.json()
        if(data.tracks && data.tracks.length){
          // Only trust real tracks (videoId or working Saavn CDN audio) — never placeholder/fallback rows
          const real = data.tracks.filter(x=> x && !String(x.id||'').startsWith('fallback-') && (x.videoId || (typeof x.audio==='string' && x.audio.startsWith('http') && !x.audio.includes('...'))))
          if(real.length >= 6) return real.slice(0, limit)
        }
      }
    }catch(e){}
  }
  const qlow=query.toLowerCase()
  const isIndian=/[\u0900-\u097F]|arijit|pritam|punjab|punjabi|hindi|sidhu|diljit|mankirt|shubh|love|90s|bollywood|bhojpuri|haryanvi|shreya|jubin|anuv|atif|sonu|kumar|alka|udit|shaan|honey|singh|kaur|yo ?yo|badshah|neha|tony|kishore|lata|asa|rafter|dhillon|gill|waraam|heera|bohra|pawande|karoran|intense/.test(qlow)
  let tracks = []
  // SOURCES IN PARALLEL — ab koi "pehle Piped ke 4s, phir Saavn" wait nahi (honey singh jaise cases fast)
  const [saavnR, pipedR] = await Promise.all([
    searchSaavn(query, isIndian? 20 : 12).catch(()=>[]),
    searchPiped(query, isIndian? 10 : limit).catch(()=>({tracks:[]})),
  ])
  const saavn = saavnR || []
  const piped = (pipedR && pipedR.tracks) || []
  tracks = dedup(isIndian ? [...saavn, ...piped] : [...piped, ...saavn])
  _lastSearchNextpage = (pipedR && pipedR.nextpage) || null
  // preview filter
  if(tracks.some(x=> !x.isPreview)){
    const filtered = tracks.filter(x=> !x.isPreview)
    if(filtered.length >= 4) tracks = filtered
  }
  if(tracks.length >= 14) return rankByRelevance(tracks, query).slice(0, limit)
  if(tracks.length < 12){
    const inv = await searchInvidious(query, limit - tracks.length).catch(()=>({tracks:[]}))
    tracks = dedup([...tracks, ...(inv.tracks||[])])
  }
  if(tracks.length < 10){
    const audius = await searchAudius(query, 8, offset).catch(()=>[])
    tracks = dedup([...tracks, ...audius])
  }
  // Only use iTunes preview if still <4 genuine full tracks — and filter out preview if any full exists
  const hasFull = tracks.some(x=> !x.isPreview)
  if(tracks.length < 4){
    const itunes = await searchITunes(query, 6).catch(()=>[])
    // if we already have full, don't add preview
    if(hasFull){
      // skip preview
    } else {
      tracks = dedup([...tracks, ...itunes])
    }
  }
  // Final filter: if any full track exists, remove all preview tracks (genuine Spotify-like)
  if(tracks.some(x=> !x.isPreview)){
    const filtered = tracks.filter(x=> !x.isPreview)
    if(filtered.length >= 4) tracks = filtered
  }
  return rankByRelevance(tracks, query).slice(0, limit)
}

// Paginated version for infinite scroll — genuine full only
export async function unifiedSearchPaginated(query, limit=20, nextpage=null){
  const res = await searchPiped(query, limit, nextpage)
  let tracks = res.tracks || []
  if(!nextpage && tracks.length < 10){
    const qlow=query.toLowerCase()
    const isIndian=/[\u0900-\u097F]|arijit|punjab|punjabi|hindi|love|bollywood/.test(qlow)
    if(isIndian){
      const saavn = await searchSaavn(query, 12).catch(()=>[])
      tracks = dedup([...tracks, ...saavn])
    }
    if(tracks.length < 8){
      const inv = await searchInvidious(query, 8).catch(()=>({tracks:[]}))
      tracks = dedup([...tracks, ...(inv.tracks||[])])
    }
  }
  // filter out preview if full exists
  if(tracks.some(x=> !x.isPreview)){
    const filtered = tracks.filter(x=> !x.isPreview)
    if(filtered.length) tracks = filtered
  }
  return { tracks: rankByRelevance(tracks, query).slice(0, limit), nextpage: res.nextpage || null }
}

const _catCache = new Map()
export async function trendingByCategory(cat, limit=20, offset=0){
  // 5-min session cache — re-click karte hi instant
  try{ const cc = _catCache.get(`${cat}|${limit}`); if(cc && Date.now()-cc.at < 5*60*1000) return cc.val }catch{}
  // Try backend first (DB + live) — fast like JioSaavn; 2.6s to-out = direct path le lagega
  if(BACKEND_URL || SELF_HOSTED || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)){
    try{
      const base = BACKEND_URL ? `${BACKEND_URL}/api/tracks` : `/api/tracks`
      const ac = new AbortController(); const tm = setTimeout(()=> ac.abort(), 2600)
      const r = await fetch(`${base}?category=${encodeURIComponent(cat)}&limit=${limit}`, { headers: { 'Accept':'application/json' }, signal: ac.signal })
      clearTimeout(tm)
      if(r.ok){
        const data = await r.json()
        if(data.tracks && data.tracks.length){
          const real = data.tracks.filter(x=> x && !String(x.id||'').startsWith('fallback-') && (x.videoId || (typeof x.audio==='string' && x.audio.startsWith('http') && !x.audio.includes('...'))))
          if(real.length >= 6){ try{ _catCache.set(`${cat}|${limit}`, { at: Date.now(), val: real.slice(0,limit) }) }catch{}; return real.slice(0, limit) }
        }
      }
    }catch(e){}
  }
  // Music-only trending — never use general YouTube trending (was showing cooking/GTA/news)
  const qmap = {
    Punjabi: "Punjabi songs Sidhu Moose Wala AP Dhillon Diljit Dosanjh Karan Aujla official audio",
    Hindi: "Hindi songs Arijit Singh official audio 2024",
    Love: "Hindi love songs romantic Arijit Singh official audio",
    "90s": "90s Hindi songs Kumar Sanu Alka Yagnik official audio",
    Bollywood: "Bollywood songs Pritam Arijit official audio 2024",
    Indie: "Indie songs Anuv Jain Prateek Kuhad official audio",
    Trending: "Trending Hindi Punjabi songs official audio 2024",
    New: "New Hindi Punjabi songs official audio 2024",
    All: "Hindi Punjabi songs official audio trending"
  }
  const q = qmap[cat] || cat
  // JioSaavn FIRST for categories (like JioSaavn/Gaana — fast, specific)
  const isIndianCat = ["Punjabi","Hindi","Love","90s","Bollywood","Indie"].includes(cat)
  if(isIndianCat){
    const saavnCat = await searchSaavn(q, 20).catch(()=>[])
    if(saavnCat.length >= 8) return strictByCategory(saavnCat, cat).slice(0, limit)
    // merge with YouTube for variety
    const pipedCat = await searchPiped(q, 12).catch(()=>({tracks:[]}))
    const mergedCat = strictByCategory(dedup([...saavnCat, ...(pipedCat.tracks||[])]), cat)
    if(mergedCat.length >= 6) return mergedCat.slice(0, limit)
  }
  if(cat==="Love"){
    const [a,b,c] = await Promise.all([
      searchSaavn("hindi romantic love songs trending", 12).catch(()=>[]),
      searchPiped("Bollywood Romantic Love Songs", 14).catch(()=>({tracks:[]})),
      searchPiped("Punjabi Love Songs Romantic", 10).catch(()=>({tracks:[]}))
    ])
    const pipedB = Array.isArray(b)? b: b.tracks||[]
    const pipedC = Array.isArray(c)? c: c.tracks||[]
    const merged = dedup([...a, ...pipedB, ...pipedC])
    if(merged.length>=6) return merged.slice(0, limit)
  }
  return strictByCategory(await unifiedSearch(q, limit+8, offset), cat).slice(0, limit)
}

export async function artistSongs(artist, limit=24){
  const [pipedRes, saavn, inv] = await Promise.all([
    searchPiped(`${artist} official audio`, limit).catch(()=>({tracks:[]})),
    searchSaavn(artist, limit).catch(()=>[]),
    searchInvidious(`${artist} songs official`, Math.ceil(limit/2)).catch(()=>({tracks:[]}))
  ])
  const piped = pipedRes.tracks || []
  const invTracks = inv.tracks||[]
  const merged = dedup([...piped, ...invTracks, ...saavn])
  if(merged.length) return merged.slice(0, limit)
  return unifiedSearch(artist, limit).then(r=> r.slice(0,limit))
}

// Paginated artist songs — total all, not just 24 (YouTube Music-like infinite)
export async function artistSongsPaginated(artist, limit=20, nextpage=null){
  // first page uses dedicated artistSongs, next pages use searchPiped with nextpage token
  if(nextpage){
    const res = await searchPiped(`${artist} songs official audio`, limit, nextpage)
    let tracks = res.tracks || []
    // strict music already filtered in searchPiped; add Saavn only on first page
    return { tracks: tracks.slice(0,limit), nextpage: res.nextpage }
  }
  // first page: combine all sources for 24, then paginate via Piped
  const [pipedRes, saavn] = await Promise.all([
    searchPiped(`${artist} songs official audio`, limit).catch(()=>({tracks:[], nextpage:null})),
    searchSaavn(artist, 10).catch(()=>[])
  ])
  let tracks = dedup([...(pipedRes.tracks||[]), ...saavn])
  if(tracks.length < 12){
    const inv = await searchInvidious(`${artist} songs official`, 8).catch(()=>({tracks:[]}))
    tracks = dedup([...tracks, ...(inv.tracks||[])])
  }
  return { tracks: tracks.slice(0,limit), nextpage: pipedRes.nextpage || null }
}

export async function getRelatedTracks(videoId, limit=12){
  if(!videoId) return []
  for(const host of PIPED_HOSTS){
    try{
      const data = await fetchJsonWithCors(`${host}/streams/${videoId}`, 4000)
      const rel = data.relatedStreams || []
      if(!rel.length) continue
      return rel.slice(0, limit).map(s=>{
        let vid = s.url?.split('v=')[1]?.split('&')[0] || String(s.url||'').split('/').pop() || s.id
        vid = (vid||'').split('?')[0].split('&')[0]
        if(!vid) return null
        return {
          id:`piped-${vid}`, videoId:vid, title:decode(s.title||"Unknown"), artist:s.uploaderName||"Related", album:"Related",
          cover:s.thumbnail||`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          audio:null, durationLabel:s.duration? formatSec(s.duration):"3:30", durationSec:s.duration||200,
          plays: s.views? `${(s.views/1000000).toFixed(1)}M`:`${(Math.random()*200).toFixed(0)}M`,
          color:pickColor(), source:'YouTube • Related', isPreview:false, original:s, host
        }
      }).filter(Boolean)
    }catch(e){ continue }
  }
  return []
}

function dedup(arr){
  const seen=new Set()
  return arr.filter(s=>{
    const k=(s.title+s.artist).toLowerCase().replace(/\s/g,'').slice(0,60)
    if(seen.has(k)) return false
    seen.add(k); return true
  })
}
function formatMs(ms){ if(!ms) return "3:30"; const s=Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` }
function formatSec(s){ if(!s) return "3:30"; const sec=Number(s); if(isNaN(sec)) return "3:30"; return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}` }
function decode(s){ if(!s) return s; try{ return decodeURIComponent(s).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#039;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>') }catch{ return s } }
function pickColor(){ const c=["#C35445","#6A418E","#A154D6","#543551","#572223","#D5AA55","#E9CDC2"]; return c[Math.floor(Math.random()*c.length)] }

// ================= Cloud account (Sur Sangam backend) =================
const SELF_HOSTED = typeof location !== 'undefined' && (location.hostname === 'thegolfsentuary.onrender.com' || location.hostname.endsWith('.onrender.com'))
const API_ON = !!(BACKEND_URL || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) || SELF_HOSTED)
const API_BASE = BACKEND_URL || ''
export const getAuthToken = ()=> { try{ return localStorage.getItem('sur_token') }catch{ return null } }
export const setAuthToken = (tok)=>{ try{ if(tok) localStorage.setItem('sur_token', tok); else localStorage.removeItem('sur_token') }catch{} }
export const isAuthEnabled = ()=> API_ON
async function apiFetch(path, opts={}){
  if(!API_ON) return null
  try{
    const tok = getAuthToken()
    const headers = { 'Content-Type':'application/json', ...(tok? { Authorization: 'Bearer '+tok } : {}) }
    const ctrl = new AbortController(); const tm = setTimeout(()=> ctrl.abort(), 9000)
    const r = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers||{}) }, signal: ctrl.signal })
    clearTimeout(tm)
    if(!r.ok) return null
    return await r.json()
  }catch{ return null }
}
export async function apiSignup(name, email, password){
  const d = await apiFetch('/api/auth/signup', { method:'POST', body: JSON.stringify({ name, email, password }) })
  if(d && d.token){ setAuthToken(d.token); return d.user }
  return null
}
export async function apiLogin(email, password){
  const d = await apiFetch('/api/auth/login', { method:'POST', body: JSON.stringify({ email, password }) })
  if(d && d.token){ setAuthToken(d.token); return d.user }
  return null
}
export async function apiMe(){ const d = await apiFetch('/api/auth/me'); return d && d.user ? d.user : null }
export function apiLogout(){ setAuthToken(null) }
export async function apiPushLikes(tracks){ return apiFetch('/api/likes', { method:'PUT', body: JSON.stringify({ tracks }) }) }
export async function apiPullLikes(){ const d = await apiFetch('/api/likes'); return d && Array.isArray(d.tracks) ? d.tracks : null }
export async function apiPushPlaylists(playlists){ return apiFetch('/api/playlists/sync', { method:'POST', body: JSON.stringify({ playlists }) }) }
export async function apiPullPlaylists(){ const d = await apiFetch('/api/playlists/sync'); return d && Array.isArray(d.playlists) ? d.playlists : null }

export async function apiDeleteAccount(){ const d = await apiFetch('/api/auth/me', { method:'DELETE' }); setAuthToken(null); return !!(d && d.ok) }
