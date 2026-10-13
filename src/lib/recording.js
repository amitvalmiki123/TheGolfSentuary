// recording.js — SAME-RECORDING identity for list dedup (not playback identity).
//
// This is deliberately separate from trackmeta's notification track key: a
// compilation copy and the original-album copy are the same recording for
// LIST purposes, but they remain distinct playable tracks elsewhere.
//
// Preference order: stable media/provider recording id, ISRC, then a
// conservative fuzzy match — normalized title core + version signature +
// credited-artist overlap + near-identical duration. Album name and
// provider-specific row ids never make a compilation copy "unique".

const VERSION_RULES = [
  ['reprise', /\breprise\b/i],
  ['unplugged', /\bunplugged\b/i],
  ['acoustic', /\bacoustic\b/i],
  ['remix', /\bremix(?:ed)?\b|\bdj mix\b|\bclub mix\b/i],
  ['live', /\blive\b/i],
  ['cover', /\bcover\b/i],
  ['instrumental', /\binstrumental\b/i],
  ['karaoke', /\bkaraoke\b/i],
  ['lofi', /\blo[-\s]?fi\b/i],
  ['slowed-reverb', /\bslowed\b|\breverb\b/i],
  ['sped-up', /\bsped[-\s]?up\b/i],
  ['mashup', /\bmashup\b/i],
  ['8d', /\b8d\b/i],
  ['female-version', /\bfemale\s+(?:version|vocal)\b/i],
  ['male-version', /\bmale\s+(?:version|vocal)\b/i],
  ['sad-version', /\bsad\s+version\b/i],
]

function cleanStr(v) { return v == null ? '' : String(v) }

function normText(v) {
  return cleanStr(v)
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function versionSignature(track) {
  const t = track || {}
  const text = `${cleanStr(t.title)} ${cleanStr(t.version || t.versionTag || '')}`
  const tags = []
  for (const [tag, re] of VERSION_RULES) if (re.test(text)) tags.push(tag)
  const part = normText(t.title).match(/\bpart\s*(\d+|i{1,3}|one|two|three)\b/)
  if (part) tags.push(`part-${part[1]}`)
  return tags.sort().join('+')
}

export function normalizeTitleCore(title) {
  let s = normText(title)
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
  s = s.replace(/\bfrom\s+["'][^"']*["']/g, ' ')
  // Trailing " - <album/label/official...>" segments are presentation, not title.
  if (s.includes(' - ')) s = s.split(' - ')[0]
  s = s.replace(/\b(official|lyrics?|lyrical|video|audio|visualizer|full\s+song|mv|hd|4k|single)\b/g, ' ')
  s = s.replace(/[^a-z0-9\u0900-\u097F]+/gi, ' ').replace(/\s+/g, ' ').trim()
  return s
}

function normName(v) {
  return normText(v)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*-\s*topic$/i, ' ').replace(/\bvevo$/i, ' ')
    .replace(/[^a-z0-9\u0900-\u097F]+/gi, ' ').replace(/\s+/g, ' ').trim()
}

export function creditNames(track) {
  const t = track || {}
  const names = []
  const push = (v) => { const n = normName(v); if (n) names.push(n) }
  const fromObj = (c) => {
    if (!c) return
    if (typeof c === 'string') { push(c); return }
    push(c.name || c.title || c.artist || '')
  }
  if (Array.isArray(t.artistCredits)) t.artistCredits.forEach(fromObj)
  const arts = t.artists || (t.original && t.original.artists)
  if (arts && typeof arts === 'object') {
    if (Array.isArray(arts.primary)) arts.primary.forEach(fromObj)
    if (Array.isArray(arts.all)) arts.all.forEach(fromObj)
    if (Array.isArray(arts.featured)) arts.featured.forEach(fromObj)
  }
  if (!names.length) {
    const raw = cleanStr(t.artist)
      .replace(/\b(feat\.?|ft\.?|featuring|with)\b/gi, ',')
    raw.split(/[,;&/•|]/).forEach(push)
  }
  return [...new Set(names)].sort()
}

export function creditIds(track) {
  const t = track || {}
  const ids = []
  const push = (v) => { const s = cleanStr(v).trim(); if (s) ids.push(s) }
  if (Array.isArray(t.artistIds)) t.artistIds.forEach(push)
  if (Array.isArray(t.artistCredits)) t.artistCredits.forEach(c => { if (c && typeof c === 'object') push(c.id || c.artistId) })
  const arts = t.artists || (t.original && t.original.artists)
  if (arts && typeof arts === 'object') {
    for (const key of ['primary', 'all', 'featured']) {
      if (Array.isArray(arts[key])) arts[key].forEach(c => { if (c && typeof c === 'object') push(c.id || c.artistId) })
    }
  }
  return [...new Set(ids)]
}

function isrcOf(track) {
  const t = track || {}
  const raw = t.isrc || t.ISRC || (t.more_info && t.more_info.isrc) ||
    (t.original && (t.original.isrc || (t.original.more_info && t.original.more_info.isrc))) || ''
  const s = cleanStr(raw).replace(/[^a-z0-9]/gi, '').toUpperCase()
  return s.length >= 8 ? s : ''
}

function providerRecordingId(track) {
  const t = track || {}
  if (t.providerId) return `id:${cleanStr(t.providerId).trim()}`
  const src = cleanStr(t.source).toLowerCase()
  const id = cleanStr(t.id)
  // Saavn rows are namespaced saavn-<songId>; client rows may add a random
  // suffix only via providerId capture, so a bare namespaced id is stable.
  if (/saavn/.test(src) && /^saavn-/.test(id)) return `id:${id}`
  const origId = t.original && (t.original.id || t.original.songId)
  if (origId && /saavn/.test(src)) return `id:saavn-${origId}`
  return ''
}

export function recordingKey(track) {
  const t = track || {}
  const vid = cleanStr(t.videoId).trim()
  if (vid) return `yt:${vid}`
  const isrc = isrcOf(t)
  if (isrc) return `isrc:${isrc}`
  const pid = providerRecordingId(t)
  if (pid) return pid
  const dur = Number(t.durationSec) || 0
  const bucket = dur > 0 ? String(Math.round(dur / 5)) : 'na'
  return `fz:${normalizeTitleCore(t.title)}|${versionSignature(t)}|${creditNames(t).join('|')}|${bucket}`
}

function durationOf(t) { const d = Number(t && t.durationSec) || 0; return d > 0 ? d : 0 }

export function isSameRecording(a, b) {
  if (!a || !b) return false
  if (String(a.id) && String(a.id) === String(b.id)) return true
  const va = cleanStr(a.videoId).trim(), vb = cleanStr(b.videoId).trim()
  if (va && vb && va === vb) return true
  const ia = isrcOf(a), ib = isrcOf(b)
  if (ia && ib && ia === ib) return versionSignature(a) === versionSignature(b)
  const pa = providerRecordingId(a), pb = providerRecordingId(b)
  if (pa && pb && pa === pb) return versionSignature(a) === versionSignature(b)

  const ta = normalizeTitleCore(a.title), tb = normalizeTitleCore(b.title)
  if (!ta || ta !== tb) return false
  if (versionSignature(a) !== versionSignature(b)) return false

  const da = durationOf(a), db = durationOf(b)
  if (da > 0 && db > 0 && Math.abs(da - db) > 3) return false

  const ca = creditNames(a), cb = creditNames(b)
  const overlap = ca.some(n => cb.includes(n))
  const subset = (ca.length && ca.every(n => cb.includes(n))) || (cb.length && cb.every(n => ca.includes(n)))
  if (da > 0 && db > 0) {
    if (!ca.length || !cb.length) return Math.abs(da - db) <= 2
    return overlap
  }
  // Missing duration on one side: only trust an exact/subset credit match.
  return subset || (overlap && ca.length === cb.length)
}

const COMPILATION_RE = /best of|greatest hits|collection|compilation|essentials|top hits|hits of|superhit|jukebox|romantic hits|love songs|chartbusters|evergreen|unforgettable|golden hits/i

export function recordingPreferenceScore(track) {
  const t = track || {}
  let score = 0
  if (!t.isPreview) score += 20
  if (typeof t.audio === 'string' && t.audio.startsWith('http')) score += 20
  if (t.audioQ && (t.audioQ.hd || t.audioQ.std)) score += 4
  if (cleanStr(t.videoId).trim()) score += 3
  const album = cleanStr(t.album)
  if (album && !/^(single|unknown|—|-)$/i.test(album)) score += COMPILATION_RE.test(album) ? -30 : 10
  if (cleanStr(t.cover)) score += 2
  if (durationOf(t) > 0) score += 2
  if (/saavn/i.test(cleanStr(t.source))) score += 4
  return score
}

// Dedup a list, replacing an earlier compilation copy with a better
// (original-album / full playable) representation of the same recording.
export function dedupeRecordings(tracks) {
  const out = []
  for (const t of tracks || []) {
    if (!t) continue
    const idx = out.findIndex(x => isSameRecording(x, t))
    if (idx === -1) out.push(t)
    else if (recordingPreferenceScore(t) > recordingPreferenceScore(out[idx])) out[idx] = t
  }
  return out
}

// Only the genuinely-new recordings from `incoming` (against prev + itself).
export function mergeRecordings(prev, incoming) {
  const kept = [...(prev || [])]
  const added = []
  for (const t of incoming || []) {
    if (!t) continue
    if (kept.some(x => isSameRecording(x, t))) continue
    kept.push(t); added.push(t)
  }
  return added
}
