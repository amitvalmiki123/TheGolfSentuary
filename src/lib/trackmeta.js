// trackmeta.js — itrace-29: ONE source of truth for track identity, artwork
// candidates and now-playing snapshots.
//
// Why this exists (build-109 regression): artwork + notification metadata were
// produced by many independent writers with no shared identity or URL rules —
// raw Piped proxy thumbnails (dead/expired hosts), Saavn size variants, http://
// URLs blocked as mixed content in the https://localhost WebView, <img> tags
// with no error fallback, and a native artwork loader that marked a URL
// "loaded" before decoding it and let late bitmaps overwrite newer tracks.
// Every consumer (lists, player, MediaSession, native bridge) now derives from
// the helpers below, and async artwork is always checked against the CURRENT
// track generation before it is shown.

// Neutral LOCAL placeholder — generated, never another song's artwork and
// never a remote stock photo pretending to be a cover.
export const COVER_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#3A2438'/><stop offset='1' stop-color='#171017'/></linearGradient></defs><rect width='480' height='480' fill='url(#g)'/><text x='240' y='300' font-size='190' font-family='system-ui,sans-serif' fill='#D5AA55' text-anchor='middle'>&#9836;</text></svg>`
)}`

const cleanStr = (v) => (typeof v === 'string' ? v : (v == null ? '' : String(v)))

// Same normalization on EVERY metadata channel (bridge push, window.__np,
// document.title, browser MediaSession). The native service crops title to 60
// and artist to 40 chars — sending exactly those strings from JS means no
// channel can disagree at a crop boundary and ping-pong "track changed".
export function normalizeMetaText(v, max) {
  const s = cleanStr(v).replace(/\|/g, '·').replace(/\s+/g, ' ').trim()
  return max > 0 ? s.slice(0, max) : s
}

// Stable identity for a track within a session. A YouTube videoId is the most
// stable id a YT track has; Saavn/backend ids are stable per song; random
// per-search suffixes only ever make a fresh play look new (a harmless reset),
// never make two different songs share a key.
export function trackKeyOf(track) {
  if (!track) return ''
  const vid = cleanStr(track.videoId).trim()
  if (vid) return `yt:${vid}`
  const id = cleanStr(track.id).trim()
  if (id) return `id:${id}`
  const t = normalizeMetaText(track.title, 60).toLowerCase()
  const a = normalizeMetaText(track.artist, 40).toLowerCase()
  return (t || a) ? `ta:${t}|${a}` : ''
}

// Generation counter: increments ONLY on a real identity change. A→B→A is
// three generations; metadata-only refreshes of the same song keep theirs, so
// stale async results from an earlier song can always be recognised.
export function createTrackTracker() {
  let key = ''
  let gen = 0
  return {
    update(track) {
      const k = trackKeyOf(track)
      if (!k) return { key: '', gen, changed: false }
      if (k !== key) { key = k; gen += 1; return { key, gen, changed: true } }
      return { key, gen, changed: false }
    },
    peek() { return { key, gen } },
    reset() { key = ''; },
  }
}

// Canonical YouTube thumbnail for THIS video — genuine same-video artwork
// that exists for every public video, unlike per-instance Piped/Invidious
// proxy thumbnail URLs (dead hosts, expired signatures).
export function ytThumb(videoId) {
  const vid = cleanStr(videoId).trim()
  return vid ? `https://i.ytimg.com/vi/${encodeURIComponent(vid)}/hqdefault.jpg` : ''
}

// Normalize ONE raw cover value into a loadable https raster URL, or ''.
// Rejects: empty/garbage, data: URIs (incl. SVG — the native
// HttpURLConnection/BitmapFactory cannot decode them), blob:, non-http(s),
// and *.svg. Upgrades http:// and protocol-relative URLs (mixed content is
// blocked in the app's https WebView), decodes &amp;, and requests the
// 500x500 Saavn CDN variant instead of the 50/150px search thumbnails.
export function normalizeCoverUrl(raw) {
  let u = cleanStr(raw).trim().replace(/&amp;/gi, '&')
  if (!u || /^(null|undefined)$/i.test(u)) return ''
  if (/^(data|blob|file|content):/i.test(u)) return ''
  if (u.startsWith('//')) u = `https:${u}`
  else if (/^http:\/\//i.test(u)) u = `https://${u.slice(7)}`
  if (!/^https:\/\//i.test(u)) return ''
  if (/\.svg(\?|#|$)/i.test(u)) return ''
  try {
    const host = new URL(u).hostname.toLowerCase()
    if (host === 'c.saavncdn.com' || host.endsWith('.saavncdn.com')) {
      u = u.replace(/-\d+x\d+(\.(?:jpe?g|png|webp))(?=([?#]|$))/i, '-500x500$1')
    }
  } catch { return '' }
  return u
}

// Ordered artwork candidates for a track. For YouTube tracks the canonical
// i.ytimg thumbnail of the SAME video comes first (Piped proxy thumbnails
// stay as a later fallback); the local placeholder is always last so a dead
// URL surfaces as a neutral tile, never a broken-image glyph and never
// another song's cover.
export function coverCandidates(track) {
  const t = track || {}
  const out = []
  const push = (u) => { if (u && !out.includes(u)) out.push(u) }
  const vid = cleanStr(t.videoId).trim()
  if (vid) push(ytThumb(vid))
  push(normalizeCoverUrl(t.cover))
  push(COVER_PLACEHOLDER)
  return out
}

// Bitmap-able artwork URL for MediaSession / the native notification: the
// first https raster candidate, or '' when the track has none (native then
// clears the previous song's bitmap instead of keeping it). Data URIs and
// SVG are never handed to native code.
export function nativeArtUrl(track) {
  for (const u of coverCandidates(track)) {
    if (/^https:\/\//i.test(u)) return u
  }
  return ''
}

// Which engine is ACTUALLY audible right now. A YouTube track resolved to a
// direct stream (APK background path) or rescued to Saavn audio plays through
// the <audio> element even though it still carries a videoId history — only a
// track with a videoId and NO direct/audio stream is the YT iframe.
export function activeEngine(track, directUrl) {
  if (!track) return 'audio'
  if (cleanStr(directUrl).startsWith('http')) return 'audio'
  if (track.videoId && !cleanStr(track.audio).startsWith('http')) return 'yt'
  return 'audio'
}

const finiteOr = (v, fb) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}

// One coherent snapshot for every now-playing channel. pos/dur are preserved
// through pause/resume and metadata-only refreshes (sanitized, clamped);
// callers pass freshly-read live values, and a real track change passes 0 so
// the fallback duration is the new track's own declared duration.
export function buildSnapshot({ track, key, gen, playing, engine, pos, dur }) {
  const t = track || {}
  const fbDur = Math.max(0, finiteOr(t.durationSec, 0))
  let d = Math.max(0, finiteOr(dur, 0))
  if (d <= 0) d = fbDur
  let p = Math.max(0, finiteOr(pos, 0))
  if (d > 0 && p > d) p = d
  const r3 = (n) => Math.round(n * 1000) / 1000
  return {
    key: key || trackKeyOf(t),
    gen: Number(gen) || 0,
    title: normalizeMetaText(t.title, 60),
    artist: normalizeMetaText(t.artist, 40),
    album: normalizeMetaText(t.album, 140),
    state: playing ? 'playing' : 'paused',
    engine: engine === 'yt' ? 'yt' : 'audio',
    pos: r3(p),
    dur: r3(d),
    artUrl: nativeArtUrl(t),
  }
}
