// YouTube Music-like — Piped (YouTube) primary with Invidious fallback, Saavn for Indian, Audius for global
import CryptoJS from 'crypto-js'
import { nativeJson, canNativeHttp } from './nativehttp.js'
import { normalizeCoverUrl, ytThumb } from './trackmeta.js'
import { dedupeRecordings, mergeRecordings, creditNames, creditIds, findSaavnMatch } from './recording.js'
import { categoryQueries, filterCategoryTracks } from './feed.js'
const PIPED_HOSTS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piapi.ggtyler.dev",
  "https://pipedapi.drgns.space",
  "https://pipedapi.leptos.at",
  "https://api.piped.private.coffee",
  "https://pipedapi.leptos.at"
]
const INVIDIOUS_HOSTS = [
  "https://inv.nadeko.net",
  "https://invidious.snopyta.org",
  "https://yewtu.be",
  "https://inv.tux.pizza"
]
// ---- Dynamic instance discovery (hardcoded hosts keep dying — ask the living list) ----
// Piped + Invidious publish their public instance lists as JSON; we fetch once/hour and
// race those hosts alongside the hardcoded ones. Dead meta-list → hardcoded fallback.
let _pipedDyn = { at:0, hosts:[] }
async function pipedDynHosts(){
  const now = Date.now()
  if(_pipedDyn.hosts.length && now - _pipedDyn.at < 3600000) return _pipedDyn.hosts
  try{
    const sig = (typeof AbortSignal!=='undefined' && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined
    const r = await fetch('https://piped-instances.kavin.rocks/', { headers:{ 'Accept':'application/json' }, signal: sig })
    if(r.ok){
      const j = await r.json().catch(()=>null)
      const list = [...new Set((Array.isArray(j) ? j : []).filter(x=> x && x.api && x.api_url).map(x=> String(x.api_url).replace(/\/$/,'')))]
        .filter(u=> u.startsWith('https://')).slice(0,8)
      if(list.length){ _pipedDyn = { at: now, hosts: list }; return list }
    }
  }catch(e){}
  return null
}
let _invDyn = { at:0, hosts:[] }
async function invDynHosts(){
  const now = Date.now()
  if(_invDyn.hosts.length && now - _invDyn.at < 3600000) return _invDyn.hosts
  try{
    const sig = (typeof AbortSignal!=='undefined' && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined
    const r = await fetch('https://api.invidious.io/instances.json', { headers:{ 'Accept':'application/json' }, signal: sig })
    if(r.ok){
      const j = await r.json().catch(()=>null)
      // shape: [ [domain, {api, cors, ...}], ... ]
      const list = [...new Set((Array.isArray(j) ? j : []).filter(x=> Array.isArray(x) && x[1] && x[1].api && x[1].cors !== false).map(x=> 'https://'+String(x[0]).replace(/\/$/,'')))]
        .filter(u=> u.startsWith('https://')).slice(0,8)
      if(list.length){ _invDyn = { at: now, hosts: list }; return list }
    }
  }catch(e){}
  return null
}
const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://yacdn.org/proxy/${url}`,
  (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
]
const BACKEND_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ? import.meta.env.VITE_API_URL : 'https://sur-sangam-api.onrender.com'
// Fire-and-forget wake-up ping: Render free tier sleeps after 15min idle (50s+ cold
// start). Calling this on app boot means the server is often warm by first search.
export function warmBackend(){
  try{
    if(!BACKEND_URL || typeof fetch==='undefined') return
    fetch(`${BACKEND_URL}/health`, { headers:{ 'Accept':'application/json' } }).catch(()=>{})
  }catch(e){}
}
// Search diagnostics: every search/trending call leaves a one-line summary on
// window.__searchDiag (shown in the You-tab card) — no more guessing WHY a source
// is missing from results.
export function sdiag(t){
  try{
    const a = (window.__searchDiag = window.__searchDiag || [])
    a.push(`${new Date().toTimeString().slice(0,8)} ${t}`.slice(0,120))
    if(a.length > 6) a.splice(0, a.length - 6)
  }catch(e){}
}
// Try backend first (if running), fallback to direct Piped/Saavn — works in memory mode too
const SAavn_ENDPOINTS = [
  (q, limit, page=1) => `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}&page=${Math.max(1,Number(page)||1)}`,
  (q, limit, page=1) => `https://jiosaavn-api-privatecvc2.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}&page=${Math.max(1,Number(page)||1)}`,
  (q, limit, page=1) => `https://jiosaavn-api-with-cors.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}&page=${Math.max(1,Number(page)||1)}`,
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
    // Canonical same-video thumbnail — Piped instance proxy thumbnails die with
    // their host / expire, which is why YouTube covers broke en masse (itrace-29).
    const cover = ytThumb(videoId)
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
          cover: ytThumb(videoId),
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

// ---------- Client-side YouTube extraction (InnerTube, device IP = trusted) ----------
// Why this exists: datacenter IPs (Render) get YouTube bot-checks; the phone's mobile
// IP doesn't. One POST to the InnerTube player API returns googlevideo audio URLs
// directly — no server cold-start, no dead third-party APIs. Primary resolver.
const YT_INNER_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW'
const YT_INNER_CLIENTS = [
  { clientName:'ANDROID', clientVersion:'18.11.34', androidSdkVersion:30 },
  { clientName:'ANDROID', clientVersion:'20.10.38', androidSdkVersion:34 },
]
export async function resolveInnerTubeAudio(videoId, ms=10000){
  const vid = String(videoId||'').slice(0,20)
  if(!vid) return { url:null, detail:'it-no-vid' }
  let lastDetail = 'it-fail'
  const pickAudio = (j)=>{
    const ps = j && j.playabilityStatus
    if(!ps || ps.status !== 'OK') return { err: (`itn-${String((ps&&ps.status)||'no-status').toLowerCase().replace(/[^a-z]/g,'')}` || 'itn-unplayable').slice(0,28) }
    const fmts = (j.streamingData && j.streamingData.adaptiveFormats) || []
    const aud = fmts.filter(f=> f && f.url && String(f.mimeType||'').startsWith('audio/'))
      .sort((a,b)=> ((a.bitrate||a.averageBitrate||999999999)-(b.bitrate||b.averageBitrate||999999999)))
    if(!aud.length) return { err:'itn-no-audio-fmt' }
    return { url: aud[0].url, itag: aud[0].itag }
  }
  // #0 — NATIVE socket first (no WebView CORS, trusted device IP). This is the shot
  // that can actually reach youtubei from inside the APK.
  if(canNativeHttp()){
    for(const c of YT_INNER_CLIENTS){
      try{
        const j = await nativeJson({
          url:`https://www.youtube.com/youtubei/v1/player?key=${YT_INNER_KEY}&prettyPrint=false`,
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body:{ videoId: vid, context:{ client:{ ...c, hl:'en', gl:'US' } } }, timeout: ms
        })
        const got = pickAudio(j)
        if(got.url) return { url: got.url, detail:'', itag: got.itag }
        lastDetail = got.err
      }catch(e){
        const m = String((e&&e.message)||e)
        lastDetail = (/abort|timeout/i.test(m) ? 'itn-timeout' : (/http (\d+)/.test(m) ? 'itn-http-'+m.match(/http (\d+)/)[1] : 'itn-fail'))
      }
    }
  }
  for(const c of YT_INNER_CLIENTS){
    try{
      const sig = (typeof AbortSignal!=='undefined' && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined
      const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_INNER_KEY}&prettyPrint=false`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify({ videoId: vid, context:{ client:{ ...c, hl:'en', gl:'US' } } }),
        signal: sig
      })
      if(!r.ok){ lastDetail = `it-http-${r.status}`; continue }
      const j = await r.json().catch(()=>null)
      const ps = j && j.playabilityStatus
      if(!ps || ps.status !== 'OK'){ lastDetail = (`it-${String((ps&&ps.status)||'no-status').toLowerCase().replace(/[^a-z]/g,'')}` || 'it-unplayable').slice(0,28); continue }
      const fmts = (j.streamingData && j.streamingData.adaptiveFormats) || []
      const aud = fmts.filter(f=> f && f.url && String(f.mimeType||'').startsWith('audio/'))
        .sort((a,b)=> ((a.bitrate||a.averageBitrate||999999999)-(b.bitrate||b.averageBitrate||999999999)))
      if(!aud.length){ lastDetail = 'it-no-audio-fmt'; continue }
      return { url: aud[0].url, detail:'', itag: aud[0].itag }
    }catch(e){
      const m = String((e&&e.message)||e)
      lastDetail = (/abort|timeout/i.test(m) ? 'it-timeout' : (/failed to fetch|network|cors|load failed/i.test(m) ? 'it-net-block' : 'it-err'))
    }
  }
  // Last shot: same InnerTube POST through corsproxy.io (forwards method+body, dodges
  // WebView CORS; proxy-egress IP may still be 429'd — diagnosis will tell).
  try{
    const sig = (typeof AbortSignal!=='undefined' && AbortSignal.timeout) ? AbortSignal.timeout(12000) : undefined
    const r = await fetch('https://corsproxy.io/?'+encodeURIComponent(`https://www.youtube.com/youtubei/v1/player?key=${YT_INNER_KEY}&prettyPrint=false`), {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify({ videoId: vid, context:{ client:{ ...YT_INNER_CLIENTS[0], hl:'en', gl:'US' } } }),
      signal: sig
    })
    if(r.ok){
      const j = await r.json().catch(()=>null)
      const ps = j && j.playabilityStatus
      if(ps && ps.status === 'OK'){
        const fmts = (j.streamingData && j.streamingData.adaptiveFormats) || []
        const aud = fmts.filter(f=> f && f.url && String(f.mimeType||'').startsWith('audio/'))
          .sort((a,b)=> ((a.bitrate||a.averageBitrate||999999999)-(b.bitrate||b.averageBitrate||999999999)))
        if(aud.length) return { url: aud[0].url, detail:'', itag: aud[0].itag }
        lastDetail = 'itpx-no-audio-fmt'
      } else lastDetail = 'itpx-' + String((ps&&ps.status)||r.status).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,18)
    } else lastDetail = `itpx-http-${r.status}`
  }catch(e){ lastDetail = 'itpx-fail' }
  return { url:null, detail:lastDetail }
}

// Probe our own server proxy: a tiny Range GET must come back as real audio bytes.
// Any non-audio response (error JSON with tried[], HTML, challenge page) = upstream
// failure — capture it for the You-tab card instead of handing a dead URL to <audio>.
async function probeServerAudio(url){
  const detail = { ok:false, text:'' }
  try{
    const sig = (typeof AbortSignal!=='undefined' && AbortSignal.timeout) ? AbortSignal.timeout(30000) : undefined
    const r = await fetch(url, { headers:{ Range:'bytes=0-1' }, signal: sig })
    const ct = (r.headers.get('content-type')||'').toLowerCase()
    const audioish = /^(audio|video)\//.test(ct) || ct.includes('octet-stream')
    if((r.status===200||r.status===206) && audioish){ detail.ok = true; return detail }
    let txt = ''
    try{ txt = await r.text() }catch(e){}
    let d = (`srv ${r.status} ${ct||'no-ctype'}`).trim()
    try{
      const j = JSON.parse(txt)
      if(j && Array.isArray(j.tried) && j.tried.length){
        d += ' tried:'+j.tried.map(t=> (t.engine||'?')+':'+(t.msg!=null ? t.msg : (t.status!=null ? t.status : '?'))).join(',')
      } else if(j && j.error){ d += ' '+String(j.error).slice(0,100) }
      else if(txt){ d += ' '+txt.slice(0,100) }
    }catch(e){ if(txt) d += ' '+txt.replace(/\s+/g,' ').slice(0,120) }
    detail.text = d.slice(0,400)
  }catch(e){
    detail.text = ('srv probe fail '+String((e&&e.name==='TimeoutError')||String((e&&e.message)||e).includes('abort') ? 'timeout 30s' : ((e&&e.message)||e))).slice(0,160)
  }
  return detail
}

// Resolve to direct audio url — ALL engines raced in PARALLEL, first playable URL wins.
// Failure notes land PROGRESSIVELY on window.__ytDirectErr so the You-tab card shows
// the diagnosis forming in real time instead of silent "pending" for 2 minutes.
export async function resolveDirectAudio(track){
  const vid = String((track&&track.videoId)||'').slice(0,20)
  if(!vid) return null
  if(typeof window!=='undefined'){
    const cache = (window.__ytAudioCache = window.__ytAudioCache || {})
    if(vid in cache) return cache[vid] || null
  }
  const notes = []
  let over = false
  const note = (t)=>{ if(!t || over) return; notes.push(t); try{ window.__ytDirectErr = notes.join(' | ').slice(0,400) }catch(e){} }
  if(typeof window!=='undefined'){ try{ window.__ytDirectErr = '' }catch(e){} }
  // #0 — InnerTube straight from the DEVICE (trusted mobile IP, no cold-start).
  // Fresh signed googlevideo URL — trusted as-is; <audio> error handler is the backstop.
  const jobInner = (async()=>{
    try{
      const it = await resolveInnerTubeAudio(vid, 8000)
      if(it && it.url) return it.url
      note(it && it.detail)
    }catch(e){}
    return null
  })()
  // #1 — server proxy (verified via probe; slow only when Render cold-starts)
  const jobServer = (async()=>{
    if(!BACKEND_URL) return null
    let url = null
    try{
      // 45s WIRED timeout: Render free-tier cold-starts take 20-50s to wake.
      const ac = new AbortController(); const tm = setTimeout(()=>ac.abort(), 45000)
      let r = null
      try{
        r = await fetch(`${BACKEND_URL}/api/audiourl?vid=${vid}${track&&track.host?('&host='+encodeURIComponent(track.host)):''}`, { headers:{ 'Accept':'application/json' }, signal: ac.signal })
      } finally { clearTimeout(tm) }
      if(r && r.ok){ const j = await r.json()
        if(j && j.url){
          url = j.url
          // never hand the WebView an http:// media url from an https:// app (mixed content = silent fail)
          if(url.startsWith('http://') && /onrender\.com/.test(url)) url = 'https://'+url.slice(7)
        } }
    }catch(e){ url = null; note('srv-unreachable'); return null }
    if(url && url.includes('/api/audiostream')){
      const probe = await probeServerAudio(url)
      if(probe.ok) return url
      note(probe.text); return null
    }
    if(url) return url
    note('srv-no-url'); return null
  })()
  // #2 — piped (hosts raced inside) + #3 invidious + #4 cobalt, device-side fallbacks
  const jobPiped = (async()=>{ try{ const u = await resolvePipedAudio(track); if(u) return u }catch(e){} note('piped-dead'); return null })()
  const jobInv = (async()=>{ try{ const u = await resolveInvidiousAudio(vid, 10000); if(u) return u }catch(e){} note('inv-dead'); return null })()
  const jobCobalt = (async()=>{
    try{
      const cr = await fetch('https://api.cobalt.tools/', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify({ url:`https://www.youtube.com/watch?v=${vid}`, downloadMode:'audio', audioFormat:'best' }),
        signal: (typeof AbortSignal!=='undefined' && AbortSignal.timeout) ? AbortSignal.timeout(12000) : undefined
      })
      if(cr.ok){ const cj = await cr.json().catch(()=>null); if(cj && typeof cj.url==='string' && cj.url.startsWith('https://')) return cj.url }
    }catch(e){}
    note('cobalt-dead'); return null
  })()
  // First URL wins (return immediately); total failure only when EVERY engine lands.
  const jobs = [jobInner, jobServer, jobPiped, jobInv, jobCobalt]
  return await new Promise((resolve)=>{
    let settled = 0, won = false
    const finish = (u)=>{
      if(over) return; over = true
      try{
        if(u){ window.__ytAudioCache[vid] = u; window.__ytDirectErr = '' }
        else { window.__ytDirectErr = (notes.join(' | ') || 'all resolvers failed').slice(0,400) }
      }catch(e){}
      resolve(u || null)
    }
    jobs.forEach(p=> p.then(u=>{
      if(u && !won){ won = true; finish(u); return }
      if(++settled === jobs.length && !won) finish(null)
    }))
  })
}

export async function resolvePipedAudio(track){
  if(track.audio && track.audio.startsWith('http')) return track.audio
  if(!track.videoId) return null
  // RACED ×2: hardcoded hosts and dynamically-discovered hosts run CONCURRENTLY —
  // whichever family has a living instance wins; discovery never delays hardcoded.
  const one = async (host)=>{
      const data = await fetchJsonWithCors(`${host}/streams/${track.videoId}`, 8000)
      const audioStreams = data.audioStreams || []
      const best = audioStreams.find(a=> a.mimeType?.includes('mp4') && a.url) || audioStreams.find(a=> a.url && a.mimeType?.includes('webm')) || audioStreams.find(a=> a.url)
      if(best?.url) return best.url
      if(data.hls) return data.hls
      throw new Error('empty')
  }
  const need = async (p)=>{ const u = await p; if(!u) throw new Error('empty'); return u }
  const hardHosts = track.host ? [track.host, ...PIPED_HOSTS.filter(h=> h!==track.host)] : PIPED_HOSTS
  const jobHard = (async()=>{ try{ return await Promise.any(hardHosts.map(one)) }catch(e){ return null } })()
  const jobDyn = (async()=>{
    try{
      const dyn = await pipedDynHosts().catch(()=>null)
      if(!dyn || !dyn.length) return null
      return await Promise.any(dyn.map(one))
    }catch(e){ return null }
  })()
  try{ return await Promise.any([need(jobHard), need(jobDyn)]) }catch(e){ return null }
}

// Invidious direct audio from the DEVICE: race dynamic+hardcoded hosts on
// /latest_version itag=140, validated by a 2-byte Range probe (must be audio/*).
export async function resolveInvidiousAudio(videoId, ms=10000){
  const vid = String(videoId||'').slice(0,20)
  if(!vid) return null
  const sig = ()=> (typeof AbortSignal!=='undefined' && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined
  const one = async (host)=>{
    const u = `${host}/latest_version?id=${vid}&local=true&itag=140`
    const r = await fetch(u, { headers:{ Range:'bytes=0-1', 'Accept':'audio/*,*/*' }, signal: sig() })
    const ct = (r.headers.get('content-type')||'').toLowerCase()
    if((r.status===200||r.status===206) && /^(audio|video)\//.test(ct)) return u
    try{ r.body && r.body.cancel && r.body.cancel() }catch(e){}
    throw new Error('non-audio')
  }
  const need = async (p)=>{ const u = await p; if(!u) throw new Error('empty'); return u }
  const jobHard = (async()=>{ try{ return await Promise.any(INVIDIOUS_HOSTS.map(one)) }catch(e){ return null } })()
  const jobDyn = (async()=>{
    try{
      const dyn = await invDynHosts().catch(()=>null)
      if(!dyn || !dyn.length) return null
      return await Promise.any(dyn.map(one))
    }catch(e){ return null }
  })()
  try{ return await Promise.any([need(jobHard), need(jobDyn)]) }catch(e){ return null }
}

// ---- JioSaavn OFFICIAL api.php ON THE DEVICE (India IP = full catalog) ----
// Same official endpoint the server uses, called straight from the phone (direct +
// CORS-proxies raced) with LOCAL DES-decrypt. Zero server dependency: even with a
// cold/dead backend, Hindi/Punjabi/Bollywood search returns instant CDN mp3s.
function saavnDecryptDevice(enc){
  try{
    const dec = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(String(enc||'').trim()) },
      CryptoJS.enc.Utf8.parse('38346591'),
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    )
    return dec.toString(CryptoJS.enc.Utf8) || ''
  }catch(e){ return '' }
}
function saavnUrlsDevice(decrypted){
  const d = String(decrypted||'').trim()
  if(!d.startsWith('http')) return []
  const m = d.match(/^(.*)_\d+\.(mp4|mp3)(\?.*)?$/)
  if(!m) return [d]
  return [96,160,320].map(q=> `${m[1]}_${q}.${m[2]}${m[3]||''}`)
}
async function searchSaavnOfficialDevice(query, limit=18, page=1){
  const n = Math.min(Math.max(Number(limit)||18,1),30)
  const pg = Math.max(1, Number(page)||1)
  const target = `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(query)}&p=${pg}&n=${n}&api_version=4&_format=json&_marker=0&ctx=web6dot0`
  // Race NATIVE socket (no CORS, India IP) against WebView fetch+proxies.
  const need = async (p)=>{ const d = await p; if(!d || typeof d !== 'object') throw new Error('empty'); return d }
  const jobs = [need(fetchJsonWithCors(target, 6000))]
  if(canNativeHttp()) jobs.push(need(nativeJson({ url: target, timeout: 8000 })))
  const data = await Promise.any(jobs)
  let results = null
  if(Array.isArray(data)) results = data
  else if(data && typeof data==='object'){
    results = data.results || (data.data && (Array.isArray(data.data) ? data.data : (data.data.results || data.data.songs))) || data.songs || null
    if(!results && data.songs && Array.isArray(data.songs.data)) results = data.songs.data
    if(!results && data.topquery && Array.isArray(data.topquery.data)) results = data.topquery.data
  }
  if(!Array.isArray(results) || !results.length) throw new Error('empty')
  const mapped = []
  for(const s of results.slice(0,n)){
    try{
      if(!s || typeof s !== 'object') continue
      if(s.type && !/song/i.test(String(s.type))) continue
      const mi = (s.more_info && typeof s.more_info === 'object') ? s.more_info : {}
      const encCand = [s.encrypted_media_url, mi.encrypted_media_url, s.encrypted_media_path, mi.encrypted_media_path].find(x=> typeof x==='string' && x.length > 20)
      const rawCand = [s.media_url, mi.media_url, s.media_urls, mi.media_urls, s.download_url, mi.download_url].find(x=> (typeof x==='string' && x.startsWith('http')) || (Array.isArray(x) && x.length))
      let urls = []
      if(typeof rawCand === 'string' && rawCand.startsWith('http')) urls = [rawCand]
      else if(Array.isArray(rawCand) && rawCand.length){ const u = rawCand.map(x=> (typeof x==='string' ? x : (x&&(x.url||x.link)))||'').find(x=> x.startsWith('http')); if(u) urls = [u] }
      else if(encCand) urls = saavnUrlsDevice(saavnDecryptDevice(encCand))
      const audio = urls.length ? urls[urls.length-1] : null
      if(typeof audio !== 'string' || !audio.startsWith('http')) continue
      // Multi-quality: CDN exposes [96,160,320] — Pro HD=320, else 160/96
      let audioQ = null
      if(urls.length >= 3) audioQ = { eco: urls[0], std: urls[1], hd: urls[2] }
      else if(urls.length === 2) audioQ = { eco: urls[0], std: urls[1], hd: urls[1] }
      // image shapes seen live: string URL | [{quality,link|url},...] | {link|url}
      let img = s.image || mi.image || ''
      if(Array.isArray(img)){ const strs = img.map(x=> (typeof x==='string' ? x : (x && (x.link || x.url)) || '')); img = strs[strs.length-1] || '' }
      else if(img && typeof img === 'object') img = img.link || img.url || ''
      img = normalizeCoverUrl(img)
      const title = decode(s.title || s.song || s.name || 'Unknown')
      const artistVal = s.primary_artists || s.primaryArtists || s.subtitle || s.artists || s.singers || mi.music || 'Unknown'
      const album = (s.album && (s.album.name || (typeof s.album==='string' ? s.album : ''))) || mi.album || s.album_name || 'Single'
      const dur = Number(s.duration) || Number(mi.duration) || 0
      const creditNamesRaw = String(artistVal).split(/[,;&/]/).map(x=> x.trim()).filter(Boolean)
      const creditIdsRaw = String(s.primary_artists_id || mi.primary_artists_id || '').split(/[,&]/).map(x=> x.trim()).filter(Boolean)
      const artistCredits = creditNamesRaw.map((name,i)=> ({ name, id: creditIdsRaw[i] || '' }))
      mapped.push({ id:`saavn-${s.id||title}-${Math.random().toString(36).slice(2,5)}`, title, artist:String(artistVal), album:String(album),
        cover: img || '',
        audio, audioQ, durationLabel: dur? formatSec(dur):'3:30', durationSec:dur||210,
        plays:`${(Math.random()*800+50).toFixed(0)}M`, color:pickColor(), source:'Saavn • Full', isPreview:false,
        language:String(s.language||mi.language||'').toLowerCase(), original:s, videoId:null,
        providerId: s.id ? `saavn-${s.id}` : '', isrc: String(s.isrc || mi.isrc || ''), year: Number(s.year || mi.year) || 0,
        artistCredits, artistIds: creditIdsRaw })
    }catch(e){ continue }
  }
  if(!mapped.length) throw new Error('empty')
  try{ if(!window.__svSrc) window.__svSrc='off' }catch(e){}
  return mapped
}

// Combined Saavn: official-on-device RACED against wrapper mirrors — first with
// results wins. Either family alive = Saavn works.
export async function searchSaavn(query, limit=18, page=1){
  try{ window.__svSrc='' }catch(e){}
  const need = async (p)=>{ const r = await p; if(!r || !r.length) throw new Error('empty'); return r }
  try{ return await Promise.any([ need(searchSaavnOfficialDevice(query, limit, page)), need(searchSaavnMirrors(query, limit, page)) ]) }
  catch(e){ return [] }
}

// Matching-only Saavn search: wait for BOTH provider families and merge
// their candidates. The raced searchSaavn above is right for fast UI search,
// but for replacing a YouTube row the first family to answer can easily be
// the one whose top results miss the exact song ("Pal", "Pehli Dafa").
export async function searchSaavnAll(query, limit=18, page=1){
  const [off, mir] = await Promise.allSettled([
    searchSaavnOfficialDevice(query, limit, page).catch(() => []),
    searchSaavnMirrors(query, limit, page).catch(() => []),
  ])
  const seen = new Set(), out = []
  for (const t of [...(off.status === 'fulfilled' ? off.value || [] : []), ...(mir.status === 'fulfilled' ? mir.value || [] : [])]) {
    if (!t || !t.audio) continue
    const key = String(t.providerId || t.audio || t.id || `${t.title}|${t.artist}|${t.durationSec || ''}`).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key); out.push(t)
  }
  return out
}

export async function searchSaavnMirrors(query, limit=18, page=1){
  // RACED: all mirrors at once, first with results wins — a dead mirror no longer
  // burns 4s before the next one is tried (old loop: 3 × 3.8s worst case).
  const one = async (buildUrl)=>{
      const url = buildUrl(query, limit, page)
      const data = await fetchJsonWithCors(url, 5000)
      let songs = []
      if(Array.isArray(data?.data?.results)) songs = data.data.results
      else if(Array.isArray(data?.data?.songs)) songs = data.data.songs
      else if(Array.isArray(data?.data)) songs = data.data
      else if(Array.isArray(data?.results)) songs = data.results
      else if(Array.isArray(data?.songs)) songs = data.songs
      else if(Array.isArray(data)) songs = data
      else if(data?.data && typeof data.data==='object' && data.data.id) songs=[data.data]
      else throw new Error('no-shape')
      if(!songs.length) throw new Error('empty')
      const mapped = songs.slice(0,limit).map(s=>{
        let img = null
        if(Array.isArray(s.image)){ const strs = s.image.map(x=> (typeof x==='string' ? x : (x && (x.url || x.link)) || '')); img = strs[strs.length-1] || null }
        else if(typeof s.image==='string') img=s.image
        else if(s.image?.url) img=s.image.url
        else if(s.image?.link) img=s.image.link
        img = normalizeCoverUrl(img)
        let audio=null
        if(Array.isArray(s.downloadUrl)){
          const last=s.downloadUrl[s.downloadUrl.length-1]
          audio=last?.url || last?.link || s.downloadUrl.find(x=> x.url||x.link)?.url || s.downloadUrl.find(x=> x.url||x.link)?.link
        } else if(typeof s.downloadUrl==='string') audio=s.downloadUrl
        else if(s.download_url) audio=s.download_url
        else if(s.url) audio=s.url
        const title=decode(s.name||s.title||s.song||"Unknown")
        const artistVal=s.artists?.primary?.map(a=>a.name).join(', ') || s.primaryArtists || s.artist || s.singers || "Unknown"
        const creditImage=(a)=>{ let im=a&&a.image; if(Array.isArray(im)){ const ss=im.map(x=> (typeof x==='string'? x : (x&&(x.url||x.link))||'')); im=ss[ss.length-1]||'' } else if(im&&typeof im==='object') im=im.url||im.link||''; return normalizeCoverUrl(im||'') }
        const creditSrc=[...(s.artists?.primary||[]), ...(s.artists?.featured||[])]
        const artistCredits=creditSrc.filter(a=> a&&(a.name||a.id)).map(a=> ({ id:String(a.id||''), name:String(a.name||''), image:creditImage(a) }))
        const artistIds=artistCredits.map(a=>a.id).filter(Boolean)
        const album=s.album?.name || (typeof s.album==='string'? s.album:null) || s.albumName || "Single"
        const dur=Number(s.duration)||Number(s.playTime)||Number(s.more_info?.duration)||0
        if(typeof audio==='string' && audio.startsWith('http') && !audio.includes('encrypted')){
          return { id:`saavn-${s.id||title}-${Math.random().toString(36).slice(2,5)}`, title, artist:artistVal, album, cover: img || '', audio, durationLabel: dur? formatSec(dur):"3:30", durationSec:dur||210, plays:`${(Math.random()*800+50).toFixed(0)}M`, color:pickColor(), source:'Saavn • Full', isPreview:false, language:String(s.language||'').toLowerCase(), original:s, videoId:null, providerId: s.id ? `saavn-${s.id}` : '', isrc: String(s.isrc||''), year: Number(s.year)||0, artistCredits, artistIds }
        }
        return null
      }).filter(Boolean).filter(x=> x.audio && x.audio.startsWith('http'))
      if(!mapped.length) throw new Error('empty')
      return mapped
  }
  try{ const r = await Promise.any(SAavn_ENDPOINTS.map(one)); try{ if(!window.__svSrc) window.__svSrc='mir' }catch(e){}; return r }catch(e){ return [] }
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

// Category membership comes from provider metadata (feed.js): language
// categories require that exact provider language — artist names/scripts are
// never used to guess a language, and a thin filtered page stays filtered
// instead of falling back to a mislabelled full list.
function strictByCategory(tracks, cat, langs){
  return filterCategoryTracks(tracks, cat, langs)
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
// Saavn-pure: videoId tracks play via the YT iframe, which Android pauses in
// background — for Indian queries they are dropped whenever Saavn is healthy.
const _svN = (t)=> (Array.isArray(t)?t:[]).filter(x=> String(x.source||'').startsWith('Saavn')).length
const _noVid = (t)=> (Array.isArray(t)?t:[]).filter(x=> !x.videoId)
const _indianRe = /[\u0900-\u097F]|arijit|pritam|punjab|punjabi|hindi|sidhu|diljit|mankirt|shubh|love|90s|bollywood|bhojpuri|haryanvi|shreya|jubin|anuv|atif|sonu|kumar|alka|udit|shaan|honey|singh|kaur|yo ?yo|badshah|neha|tony|kishore|lata|asa|rafter|dhillon|gill|waraam|heera|bohra|pawande|karoran|intense|aujla|aulakh|sandhu|handa|mithoon|akhil|bhullar|paudwal|kakkar|praak|qismat|jaani|armaan|ammy|ninja|jass|buttar|virk|gurnam|sharry|maan|talwiinder|saiyaara|riar/
export async function unifiedSearch(query, limit=24, offset=0){
  _lastSearchNextpage = null
  if(!query.trim()) return []
  const qtag = String(query).slice(0,14)
  const qlow=query.toLowerCase()
  const isIndian=_indianRe.test(qlow)
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
          const nSv = _svN(real)
          if(real.length >= 6 && nSv >= 4){
            { const pure = _noVid(real); _lastSearchNextpage = encFeedCursor({sp:2,pp:null,sDone:false,pDone:false}); sdiag(`s:${qtag} be:ok${real.length}/sv${nSv}+svonly${pure.length}`); return pure.slice(0, limit) }
          }
          if(real.length >= 6 && nSv < 4){
            // Backend won with YT-only tracks — top up with device-Saavn so
            // zero-Saavn screen par bhi Saavn flavours milte rahein.
            const top = await searchSaavn(query, 16).catch(()=>[])
            const merged = dedup([...(Array.isArray(top)?top:[]), ...real]).slice(0, limit)
            const mSv = _svN(merged)
            if(mSv >= 2){ const pure = _noVid(merged); _lastSearchNextpage = encFeedCursor({sp:2,pp:null,sDone:false,pDone:false}); sdiag(`s:${qtag} be:ok${real.length}/sv${nSv}+top${mSv}+svonly${pure.length}`); return pure.slice(0, limit) }
            sdiag(`s:${qtag} be:ok${real.length}/sv${nSv}+top${mSv}`)
            return merged
          }
          sdiag(`s:${qtag} be:thin${real.length}`)
        } else sdiag(`s:${qtag} be:empty`)
      } else sdiag(`s:${qtag} be:http${r.status}`)
    }catch(e){ sdiag(`s:${qtag} be:${/abort/i.test(String((e&&e.message)||e)) ? 'timeout' : 'fail'}`) }
  }
  let tracks = []
  // SOURCES IN PARALLEL — ab koi "pehle Piped ke 4s, phir Saavn" wait nahi (honey singh jaise cases fast)
  const [saavnR, pipedR] = await Promise.all([
    searchSaavn(query, isIndian? 20 : 12).catch(()=>[]),
    searchPiped(query, isIndian? 10 : limit).catch(()=>({tracks:[]})),
  ])
  const saavn = saavnR || []
  const piped = (pipedR && pipedR.tracks) || []
  try{ sdiag(`s:${qtag} dev:sv${saavn.length}${window.__svSrc?'/'+window.__svSrc:''} pp${piped.length}`) }catch(e){}
  tracks = dedup(isIndian ? [...saavn, ...piped] : [...piped, ...saavn])
  _lastSearchNextpage = (pipedR && pipedR.nextpage) || null
  // preview filter
  if(tracks.some(x=> !x.isPreview)){
    const filtered = tracks.filter(x=> !x.isPreview)
    if(filtered.length >= 4) tracks = filtered
  }
  if(tracks.length >= 14){ let out = rankByRelevance(tracks, query).slice(0, limit); if(_svN(out) >= 2){ out = _noVid(out); _lastSearchNextpage = encFeedCursor({sp:2, pp:_lastSearchNextpage||null, sDone:false, pDone:!_lastSearchNextpage}) } try{ sdiag(`s:${qtag} out:${out.length}/sv${_svN(out)}`) }catch(e){}; return out }
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
  let outF = rankByRelevance(tracks, query).slice(0, limit)
  if(_svN(outF) >= 2){ outF = _noVid(outF); _lastSearchNextpage = encFeedCursor({sp:2, pp:_lastSearchNextpage||null, sDone:false, pDone:!_lastSearchNextpage}) }
  try{ sdiag(`s:${qtag} out:${outF.length}/sv${_svN(outF)}`) }catch(e){}
  return outF
}

// Paginated version for infinite scroll — genuine full only
export async function unifiedSearchPaginated(query, limit=20, nextpage=null){
  // Composite cursor: Saavn page number + Piped cursor advance independently.
  // A page of only already-seen recordings still returns the NEXT composite
  // cursor (App's pager advances through it), never a repeated one.
  let st = { sp:1, pp:null, sDone:false, pDone:false, first:true }
  if(nextpage){
    if(typeof nextpage === 'string' && nextpage.startsWith('mx1.')){
      try{ st = { ...st, ...JSON.parse(decodeURIComponent(nextpage.slice(4))), first:false } }catch{}
    } else st = { sp:2, pp:nextpage, sDone:false, pDone:false, first:false }
  }
  const qlow=String(query||'').toLowerCase()
  const isIndian=/[\u0900-\u097F]|arijit|punjab|punjabi|hindi|love|bollywood/.test(qlow)
  let pipedTracks = []
  if(!st.pDone){
    const res = await searchPiped(query, limit, st.pp || null).catch(()=>({ tracks:[], nextpage:null }))
    pipedTracks = res.tracks || []
    const np = res.nextpage || null
    if(!np || (st.pp && String(np) === String(st.pp))) st.pDone = true
    st.pp = np
  }
  let saavnTracks = []
  if(!st.sDone && (isIndian || st.first)){
    const raw = await searchSaavn(query, 20, st.sp || 1).catch(()=>[])
    saavnTracks = raw || []
    st.sp = (st.sp||1)+1
    if(!raw || raw.length < 20) st.sDone = true
  } else if(!isIndian) st.sDone = true
  let tracks = dedup([...pipedTracks, ...saavnTracks])
  if(st.first && tracks.length < 8){
    const inv = await searchInvidious(query, 8).catch(()=>({tracks:[]}))
    tracks = dedup([...tracks, ...(inv.tracks||[])])
  }
  if(tracks.some(x=> !x.isPreview)){
    const filtered = tracks.filter(x=> !x.isPreview)
    if(filtered.length) tracks = filtered
  }
  const hasMore = !st.sDone || !st.pDone
  return { tracks: rankByRelevance(tracks, query).slice(0, Math.max(limit, 40)), nextpage: hasMore ? encFeedCursor(st) : null }
}

// ---- Saavn canonicalization for YouTube-only rows ----------------------
// Category feeds (especially Indie) can arrive as YouTube-only rows even
// when the exact same recording is on Saavn ("The Last Letter", "Finding
// Her", "Arz Kiya Hai"). A YouTube row only starts through the iframe,
// which Android pauses in the background, so confidently-matched rows are
// replaced with the Saavn recording BEFORE they reach the list/queue.
// Distinct covers/live/remix/lofi versions are never replaced: matching
// requires the same title core, version signature, credit evidence and a
// near-identical duration (findRecordingMatch in recording.js).
const _saavnMatchCache = new Map()
function _saavnSearchTitle(track){
  return String((track && track.title) || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(official|lyrics?|lyrical|video|audio|visualizer|full\s+song|mv|hd|4k)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim()
}
export async function preferSaavnRecordings(tracks, maxLookups=16){
  const list = Array.isArray(tracks) ? tracks : []
  if (!list.some(t => t && t.videoId && !t.audio)) return list
  const playable = list.filter(t => t && typeof t.audio === 'string' && t.audio.startsWith('http'))
  const out = [...list]
  const jobs = []
  list.forEach((t, i) => { if (t && t.videoId && !t.audio) jobs.push(i) })
  let cursor = 0, lookups = 0
  const worker = async () => {
    while (cursor < jobs.length) {
      const i = jobs[cursor++]
      const t = out[i]
      if (!t) continue
      const local = findSaavnMatch(t, playable)
      if (local) { out[i] = { ...local, title: t.title || local.title, artist: t.artist || local.artist, cover: local.cover || t.cover }; continue }
      if (lookups >= maxLookups) continue
      lookups++
      const key = String(t.videoId || `${_saavnSearchTitle(t)}|${t.artist || ''}|${t.durationSec || ''}`).toLowerCase()
      try {
        if (_saavnMatchCache.has(key)) {
          const hit = _saavnMatchCache.get(key)
          if (hit) out[i] = { ...hit, title: t.title || hit.title, artist: t.artist || hit.artist, cover: hit.cover || t.cover }
          continue
        }
        const match = await findSaavnRecording(t).catch(() => null)
        _saavnMatchCache.set(key, match || null)
        if (match) out[i] = { ...match, title: t.title || match.title, artist: t.artist || match.artist, cover: match.cover || t.cover }
      } catch { try { _saavnMatchCache.set(key, null) } catch {} }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return dedupeRecordings(out)
}

function _saavnAlbumHint(track){
  const title = String((track && track.title) || '')
  const m = title.match(/\(\s*from\s+["']?([^)"']+)["']?\s*\)/i) || title.match(/\[\s*from\s+([^\]]+)\]/i)
  if (m) return m[1].replace(/["']/g, '').trim()
  const album = String((track && track.album) || '').trim()
  return album && !/^(single|unknown|youtube|—|-)$/i.test(album) && album !== String((track && track.artist) || '').trim() ? album : ''
}

// Playback-rescue lookup: only a confidently identical Saavn recording may
// replace a YouTube track. Returning null is intentional for genuine
// YouTube-only covers/versions — the caller must not play a different song
// just because it happened to be Saavn's first search result. Several query
// shapes are tried because the first provider query can rank an unrelated
// mashup/compilation above the exact song when an artist spelling differs.
export async function findSaavnRecording(track){
  if (!track || !track.videoId) return null
  const title = _saavnSearchTitle(track)
  if (title.length <= 3) return null
  const artistRaw = String(track.artist || '').trim()
  const firstArtist = artistRaw.split(/[,;&/]/)[0].trim()
  const artistFlat = firstArtist.replace(/\s+-\s+/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  const artistJoined = firstArtist.replace(/\s+-\s+/g, '-').replace(/\s+/g, ' ').trim()
  const albumHint = _saavnAlbumHint(track)
  const queries = [...new Set([
    `${title} ${firstArtist}`.trim(),
    artistFlat && artistFlat !== firstArtist ? `${title} ${artistFlat}`.trim() : '',
    artistJoined && artistJoined !== firstArtist ? `${title} ${artistJoined}`.trim() : '',
    title,
    albumHint ? `${title} ${albumHint}`.trim() : '',
  ].filter(q => q && q.length > 3))]
  for (const q of queries) {
    const candidates = await searchSaavnAll(q, 12).catch(() => [])
    const match = findSaavnMatch(track, candidates || [])
    if (match) return match
  }
  return null
}

const _catCache = new Map()
export async function trendingByCategory(cat, limit=20, offset=0){
  // 5-min session cache — re-click karte hi instant
  try{ const cc = _catCache.get(`${cat}|${limit}`); if(cc && Date.now()-cc.at < 5*60*1000) return cc.val }catch{}
  // BACKEND-FIRST (works from inside the APK too): server does Saavn live search — no WebView
  // CORS/DNS issues, real full-length tracks, no YouTube-only fallback like before.
  if(BACKEND_URL){
    try{
      const ac = new AbortController(); const tm = setTimeout(()=> ac.abort(), 6000)
      const r = await fetch(`${BACKEND_URL}/api/trending?cat=${encodeURIComponent(cat)}&limit=${limit}`, { headers:{'Accept':'application/json'}, signal: ac.signal })
      clearTimeout(tm)
      if(r.ok){
        const data = await r.json()
        const real = (data.tracks||[]).filter(x=> x && x.audio && String(x.audio).startsWith('http'))
        {
          const nSv0 = _svN(real)
          if(real.length >= 6 && nSv0 >= 4){ const pure = _noVid(real); sdiag(`t:${cat} be:ok${real.length}/sv${nSv0}+svonly${pure.length}`); try{ _catCache.set(`${cat}|${limit}`, { at: Date.now(), val: pure.slice(0,limit) }) }catch{}; return pure.slice(0, limit) }
          if(real.length >= 6){
            // YT-only backend win — top up with device-Saavn for this category.
            const top = await searchSaavn(cat==='Trending India' ? 'Trending India' : `${cat} hindi songs`, 16).catch(()=>[])
            const merged = dedup([...(Array.isArray(top)?top:[]), ...real]).slice(0, limit)
            const mSv = _svN(merged)
            if(mSv >= 2){ const pure = _noVid(merged); sdiag(`t:${cat} be:ok${real.length}/sv${nSv0}+top${mSv}+svonly${pure.length}`); try{ _catCache.set(`${cat}|${limit}`, { at: Date.now(), val: pure.slice(0,limit) }) }catch{}; return pure.slice(0, limit) }
            sdiag(`t:${cat} be:ok${real.length}/sv${nSv0}+top${mSv}`); try{ _catCache.set(`${cat}|${limit}`, { at: Date.now(), val: merged }) }catch{}; return merged
          }
          sdiag(`t:${cat} be:thin${real.length}`)
        }
      } else sdiag(`t:${cat} be:http${r.status}`)
    }catch(e){ sdiag(`t:${cat} be:${/abort/i.test(String((e&&e.message)||e)) ? 'timeout' : 'fail'}`) }
  }
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
          if(real.length >= 6){ const pure = _svN(real) >= 2 ? _noVid(real) : real; try{ _catCache.set(`${cat}|${limit}`, { at: Date.now(), val: pure.slice(0,limit) }) }catch{}; return pure.slice(0, limit) }
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
  const isIndianCat = ["Punjabi","Hindi","Love","90s","Bollywood","Indie","Trending"].includes(cat)
  if(isIndianCat){
    const saavnCat = await searchSaavn(q, 20).catch(()=>[])
    try{ sdiag(`t:${cat} dev:sv${saavnCat.length}${window.__svSrc?'/'+window.__svSrc:''}`) }catch(e){}
    if(saavnCat.length >= 8) return strictByCategory(saavnCat, cat).slice(0, limit)
    // merge with YouTube for variety
    const pipedCat = await searchPiped(q, 12).catch(()=>({tracks:[]}))
    const mergedCat = strictByCategory(dedup([...saavnCat, ...(pipedCat.tracks||[])]), cat)
    try{ sdiag(`t:${cat} out:${mergedCat.length}/sv${mergedCat.filter(x=>String(x.source||'').startsWith('Saavn')).length}`) }catch(e){}
    if(mergedCat.length >= 6){ const pure = _svN(mergedCat) >= 2 ? _noVid(mergedCat) : mergedCat; return pure.slice(0, limit) }
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
    if(merged.length>=6){ const pure = _svN(merged) >= 2 ? _noVid(merged) : merged; return pure.slice(0, limit) }
  }
  return strictByCategory(await unifiedSearch(q, limit+8, offset), cat).slice(0, limit)
}

// ---- Real paginated category feed -------------------------------------
// Cursor is an opaque JSON string carrying PER-PROVIDER state, so a
// duplicate-only or category-filtered-empty page still advances to the next
// real provider page/cursor instead of ending the feed. `total` stays null:
// providers do not report a trustworthy catalog total, and the UI must say
// "not reported" rather than invent one.
function encFeedCursor(o){ try{ return 'mx1.'+encodeURIComponent(JSON.stringify(o)) }catch{ return null } }
function decFeedCursor(s){
  if(!s || typeof s!=='string') return null
  if(!s.startsWith('mx1.')) return { q:0, sp:2, pp:s, bp:2, sDone:false, pDone:false, bDone:true }
  try{ return JSON.parse(decodeURIComponent(s.slice(4))) }catch{ return null }
}
export async function fetchCategoryPage(cat, cursor=null, limit=24, langs=[]){
  const queries = categoryQueries(cat, langs)
  if(!cursor){
    // First page keeps the fast existing path (backend + device providers).
    let first = []
    try{ first = await trendingByCategory(cat === 'All' ? 'Trending' : cat, limit) }catch{}
    first = filterCategoryTracks(dedupeRecordings((first||[]).filter(x=> x && !x.isPreview)), cat, langs)
    // The fast path can still win with a YouTube-only backend page (Indie):
    // canonicalize those rows to Saavn before the list/queue ever sees them.
    first = filterCategoryTracks(await preferSaavnRecordings(first, 18), cat, langs)
    const st = { q:0, sp:2, pp:null, bp:2, sDone:false, pDone:false, bDone:false }
    if(first.length) return { tracks:first.slice(0, limit), nextCursor: encFeedCursor(st), total:null }
    cursor = encFeedCursor({ q:0, sp:1, pp:null, bp:1, sDone:false, pDone:false, bDone:false })
  }
  const st = decFeedCursor(cursor) || { q:0, sp:1, pp:null, bp:1, sDone:false, pDone:false, bDone:false }
  if(st.q >= queries.length) return { tracks:[], nextCursor:null, total:null }
  const q = queries[st.q]
  let backendTracks = []
  if(BACKEND_URL && !st.bDone){
    try{
      const ac = new AbortController(); const tm = setTimeout(()=> ac.abort(), 6000)
      const r = await fetch(`${BACKEND_URL}/api/trending?cat=${encodeURIComponent(cat)}&limit=${limit}&page=${st.bp||1}${st.pp?`&nextpage=${encodeURIComponent(st.pp)}`:''}`, { headers:{'Accept':'application/json'}, signal: ac.signal })
      clearTimeout(tm)
      if(r.ok){
        const data = await r.json()
        // Only a backend that echoes the real-pagination contract is trusted
        // for later pages; an old deployment ignoring `page` is used once
        // (page 1 path above) and never mistaken for successive pages.
        if(data && data.paging === 'provider-v1'){ backendTracks = data.tracks||[]; st.bp = (st.bp||1)+1; if(!data.nextpage) st.bDone = true }
        else st.bDone = true
      } else st.bDone = true
    }catch{ st.bDone = true }
  }
  let saavnTracks = []
  if(!st.sDone){
    saavnTracks = await searchSaavn(q, 20, st.sp||1).catch(()=>[])
    st.sp = (st.sp||1)+1
    if(!saavnTracks || saavnTracks.length < 20) st.sDone = true
  }
  let pipedTracks = []
  if(!st.pDone){
    const res = await searchPiped(q, 20, st.pp || null).catch(()=>({ tracks:[], nextpage:null }))
    pipedTracks = res.tracks || []
    const np = res.nextpage || null
    if(!np || (st.pp && String(np) === String(st.pp))) st.pDone = true
    st.pp = np
  }
  let merged = dedupeRecordings([...backendTracks, ...saavnTracks, ...pipedTracks].filter(x=> x && !x.isPreview))
  merged = filterCategoryTracks(await preferSaavnRecordings(merged, 16), cat, langs)
  if(st.sDone && st.pDone && st.bDone){
    st.q = (st.q||0)+1; st.sp = 1; st.pp = null; st.bp = 1; st.sDone = false; st.pDone = false; st.bDone = false
  }
  const hasMore = st.q < queries.length
  return { tracks: merged.slice(0, Math.max(limit, 40)), nextCursor: hasMore ? encFeedCursor(st) : null, total:null }
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
  if(_svN(merged) >= 2) return _noVid(merged).slice(0, limit)
  if(merged.length) return merged.slice(0, limit)
  return unifiedSearch(artist, limit).then(r=> r.slice(0,limit))
}

// ---- Artist identity, profile portrait, and credited songs -------------
// Songs are only attributed to an artist when PROVIDER credit metadata says
// so (Saavn artist credits/ids, or a YouTube artist/topic channel). A generic
// name search that merely mentions the name never attributes a song, and a
// song/album cover is never used as the artist's portrait.
function normArtistName(v){
  return String(v||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/\s*-\s*topic$/i,'').replace(/\bvevo$/i,'')
    .replace(/[^a-z0-9\u0900-\u097F]+/gi,' ').replace(/\s+/g,' ').trim()
}
function trackCreditsArtist(track, artistName, artistId){
  if(artistId && creditIds(track).map(String).includes(String(artistId))) return true
  const want = normArtistName(artistName)
  if(!want) return false
  return creditNames(track).some(n=> normArtistName(n) === want)
}
function artistImageFrom(data){
  if(!data || typeof data!=='object') return ''
  let im = data.image || data.images || data.avatar || ''
  if(Array.isArray(im)){ const ss = im.map(x=> (typeof x==='string'? x : (x&&(x.url||x.link))||'')); im = ss[ss.length-1] || '' }
  else if(im && typeof im==='object') im = im.url || im.link || ''
  return normalizeCoverUrl(im || '')
}
const ARTIST_API_BASES = [
  'https://saavn.dev/api',
  'https://jiosaavn-api-privatecvc2.vercel.app/api',
  'https://jiosaavn-api-with-cors.vercel.app/api',
]
export async function fetchArtistProfile(artist){
  const name = typeof artist === 'string' ? artist : (artist && artist.name) || ''
  let id = (artist && typeof artist === 'object' && (artist.id || artist.artistId)) || ''
  let image = (artist && typeof artist === 'object' && artist.image) ? normalizeCoverUrl(artist.image) : ''
  let followers = null
  // A genuine portrait already carried by provider artist-credit metadata.
  if(!image && artist && Array.isArray(artist.artistCredits)){
    const hit = artist.artistCredits.find(c=> c && normArtistName(c.name) === normArtistName(name) && c.image)
    if(hit) image = normalizeCoverUrl(hit.image)
  }
  try{
    if(!id){
      for(const base of ARTIST_API_BASES){
        try{
          const d = await fetchJsonWithCors(`${base}/search/artists?query=${encodeURIComponent(name)}&limit=5`, 4000)
          const list = (d && d.data && (d.data.results || d.data)) || (d && d.results) || []
          const hit = (Array.isArray(list)? list: []).find(a=> a && normArtistName(a.name) === normArtistName(name))
          if(hit){ id = String(hit.id || ''); image = image || artistImageFrom(hit); if(hit.followerCount != null) followers = hit.followerCount; break }
        }catch(e){ continue }
      }
    }
    if(id){
      for(const base of ARTIST_API_BASES){
        try{
          const d = await fetchJsonWithCors(`${base}/artists/${encodeURIComponent(id)}`, 4000)
          const a = (d && (d.data || d)) || null
          if(a && (a.name || a.image)){ image = image || artistImageFrom(a); if(a.followerCount != null) followers = a.followerCount; break }
        }catch(e){ continue }
      }
    }
  }catch(e){}
  // No reliable portrait -> image stays '' and the UI renders initials.
  return { id: String(id || ''), name, image, followers, source: id ? 'saavn' : '' }
}

// Paginated artist songs — successive Saavn pages + Piped cursors, filtered
// to tracks that actually credit this artist. Cursor is an opaque mx1 JSON
// string; a filtered-empty page still carries a valid continuation.
export async function artistSongsPaginated(artist, limit=20, nextpage=null){
  const name = typeof artist === 'string' ? artist : (artist && artist.name) || ''
  const artistId = (artist && typeof artist === 'object' && (artist.id || artist.artistId)) || ''
  let st = { sp:1, pp:null, sDone:false, pDone:false }
  if(nextpage){
    if(typeof nextpage === 'string' && nextpage.startsWith('mx1.')){
      try{ st = { ...st, ...JSON.parse(decodeURIComponent(nextpage.slice(4))) } }catch{}
    } else st = { sp:2, pp:nextpage, sDone:true, pDone:false }
  }
  let saavnTracks = []
  if(!st.sDone){
    const raw = await searchSaavn(name, 20, st.sp || 1).catch(()=>[])
    saavnTracks = (raw||[]).filter(t=> trackCreditsArtist(t, name, artistId))
    st.sp = (st.sp||1)+1
    if(!raw || raw.length < 20) st.sDone = true
  }
  let pipedTracks = []
  if(!st.pDone){
    const res = await searchPiped(`${name} songs official audio`, limit, st.pp || null).catch(()=>({ tracks:[], nextpage:null }))
    pipedTracks = (res.tracks||[]).filter(t=> trackCreditsArtist(t, name, artistId))
    const np = res.nextpage || null
    if(!np || (st.pp && String(np) === String(st.pp))) st.pDone = true
    st.pp = np
  }
  const tracks = dedupeRecordings([...saavnTracks, ...pipedTracks].filter(x=> x && !x.isPreview))
  const hasMore = !st.sDone || !st.pDone
  return { tracks: tracks.slice(0, Math.max(limit, 40)), nextpage: hasMore ? encFeedCursor(st) : null, total: null }
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
          cover: ytThumb(vid),
          audio:null, durationLabel:s.duration? formatSec(s.duration):"3:30", durationSec:s.duration||200,
          plays: s.views? `${(s.views/1000000).toFixed(1)}M`:`${(Math.random()*200).toFixed(0)}M`,
          color:pickColor(), source:'YouTube • Related', isPreview:false, original:s, host
        }
      }).filter(Boolean)
    }catch(e){ continue }
  }
  return []
}

// Same-recording dedup lives in recording.js (stable media/ISRC identity,
// then title+version+credit-overlap+duration). Album/provider row ids never
// make a compilation copy unique; live/remix/reprise/acoustic stay distinct.
function dedup(arr){ return dedupeRecordings(arr) }
export function mergeDedup(prev, incoming){ return mergeRecordings(prev, incoming) }
export { dedupeRecordings, mergeRecordings }

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
export async function apiRedeemPro(code){ const d = await apiFetch('/api/auth/redeem', { method:'POST', body: JSON.stringify({ code }) }); return d||null }
export async function apiSetPlan(plan){ const d = await apiFetch('/api/auth/plan', { method:'POST', body: JSON.stringify({ plan }) }); return d && d.user ? d.user : null }
