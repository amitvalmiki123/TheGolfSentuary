// artistsearch.js — decide whether a search query is really about an artist.
//
// A profile shortcut is useful for "Arijit", "Arijit Singh" and
// "Arijit Singh songs", but a title search such as "Tum Hi Ho" must not
// suddenly promote Arijit Singh merely because he sings the first result.
// The query itself therefore has to match the artist's name; result credits
// are used to resolve a partial keyword to the full credited name.
const DESCRIPTOR_TOKENS = new Set([
  'song', 'songs', 'new', 'latest', 'hit', 'hits', 'official', 'audio',
  'music', 'playlist', 'all', 'best', 'top', 'full', 'video', 'videos',
  'mp3', 'download', 'list', 'live', 'concert',
])
const NON_ARTIST_NAME = /\b(records?|label|entertainment|production|world\s+music|zee\s+music|t[-\s]?series|tips\s+(?:official|music)?)\b/i

export function normalizeArtistKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0900-\u097F]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensOf(value) {
  const normalized = normalizeArtistKey(value)
  return normalized ? normalized.split(' ').filter(Boolean) : []
}

function cleanQueryTokens(query) {
  return tokensOf(query).filter(token => !DESCRIPTOR_TOKENS.has(token))
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return row[b.length]
}

function tokenMatches(queryToken, candidateToken) {
  if (queryToken === candidateToken) return true
  // Tolerate common transliteration spelling people actually type
  // ("Arman" -> Armaan, "Sidhe" -> Seedhe) without opening up loose
  // fuzzy matching for short words or song titles.
  const longest = Math.max(queryToken.length, candidateToken.length)
  const allowed = longest >= 6 ? 2 : 1
  return queryToken.length >= 4
    && candidateToken.length >= 4
    && queryToken[0] === candidateToken[0]
    && editDistance(queryToken, candidateToken) <= allowed
}

function allIncluded(needles, haystack) {
  const used = new Set()
  return needles.every(needle => {
    const index = haystack.findIndex((token, i) => !used.has(i) && tokenMatches(needle, token))
    if (index < 0) return false
    used.add(index)
    return true
  })
}

export function creditedArtistNames(track) {
  const names = []
  const push = value => {
    const name = String(value || '').replace(/\s+-\s+topic$/i, '').trim()
    if (!name || NON_ARTIST_NAME.test(name)) return
    if (!names.some(existing => normalizeArtistKey(existing) === normalizeArtistKey(name))) names.push(name)
  }

  if (track && Array.isArray(track.artistCredits)) {
    for (const credit of track.artistCredits) push(typeof credit === 'string' ? credit : credit && credit.name)
  }

  const albumKey = normalizeArtistKey(track && track.album)
  const raw = String((track && track.artist) || '')
    .split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0]
  for (let part of raw.split(/\s*(?:,|;|\||\/)\s*/)) {
    part = String(part || '').trim()
    if (!part) continue
    // Saavn rows sometimes append " - <album>" to the last credited name.
    // Only strip it when it really is this track's album, so a duo such as
    // "Javed - Mohsin" keeps its actual credited name.
    if (albumKey && part.includes(' - ')) {
      const cut = part.lastIndexOf(' - ')
      if (normalizeArtistKey(part.slice(cut + 3)) === albumKey) part = part.slice(0, cut)
    }
    push(part)
  }
  return names
}

export function findArtistForSearch(query, tracks = [], knownArtists = []) {
  const queryTokens = cleanQueryTokens(query)
  if (!queryTokens.length) return null

  const candidates = new Map()
  const addCandidate = (value, { known = false, frequency = 0 } = {}) => {
    const name = typeof value === 'string' ? value : value && value.name
    const key = normalizeArtistKey(name)
    if (!key || NON_ARTIST_NAME.test(String(name || ''))) return
    const existing = candidates.get(key) || { name: String(name).trim(), known: false, frequency: 0 }
    existing.known = existing.known || known
    existing.frequency += frequency
    candidates.set(key, existing)
  }

  for (const artist of knownArtists || []) addCandidate(artist, { known: true })
  for (const track of (Array.isArray(tracks) ? tracks : []).slice(0, 20)) {
    for (const name of creditedArtistNames(track)) addCandidate(name, { frequency: 1 })
  }

  let best = null
  for (const candidate of candidates.values()) {
    const candidateTokens = tokensOf(candidate.name)
    if (!candidateTokens.length) continue

    let base = 0
    let match = ''
    if (allIncluded(queryTokens, candidateTokens) && allIncluded(candidateTokens, queryTokens)) {
      base = 100
      match = 'exact'
    } else if (allIncluded(candidateTokens, queryTokens)) {
      base = 92
      match = 'query-contains-artist'
    } else if (allIncluded(queryTokens, candidateTokens)) {
      base = queryTokens.length === 1 ? 78 : 88
      match = 'partial-name'
    } else {
      continue
    }

    // A one-word keyword for a person who is not in the known list needs
    // repeated credit evidence ("Mithoon" across several results). This
    // prevents a label or one-off credit fragment becoming a profile.
    if (queryTokens.length === 1 && match === 'partial-name' && !candidate.known && candidate.frequency < 2) continue
    if (queryTokens.length === 1 && queryTokens[0].length < 3) continue

    const score = base
      + (candidate.known ? 8 : 0)
      + Math.min(candidate.frequency, 10) * 2
      - Math.max(0, candidateTokens.length - queryTokens.length) * 2

    if (!best || score > best.score
      || (score === best.score && candidate.frequency > best.frequency)
      || (score === best.score && candidate.frequency === best.frequency && candidate.known && !best.known)) {
      best = { name: candidate.name, score, match, known: candidate.known, frequency: candidate.frequency }
    }
  }
  return best
}
