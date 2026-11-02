// playbackcontext.js — MaxMusic build 133 "Smart Queue / Radio Mode".
//
// ONE pure model for WHAT a queue is following. Before this module the queue
// was just a flat array copied from whatever list the user tapped, so a track
// played from search results silently continued the RAW search list (same
// keyword, often a different version/artist). Here a playback context is
// explicit and serialisable:
//
//   { kind: 'search' | 'category' | 'playlist' | 'album' | 'radio',
//     id, label, seed, auto, origin }
//
//  - list contexts (category / playlist / album) auto-advance inside their
//    own list — exactly the behaviour that already existed.
//  - a search context NEVER continues the search results: the chosen track
//    plays alone and the next auto track is RADIO seeded by that track's
//    primary category (falling back to related categories when a category
//    is exhausted).
//  - 'auto' records whether radio filling is allowed for this context, so a
//    restored/legacy session keeps its old advance semantics.
//
// Nothing here touches React, network or storage: db.js persists the plain
// object, App.jsx wires it to the player, tests exercise it directly.

export const CONTEXT_KINDS = ['search', 'category', 'playlist', 'album', 'radio']
export const AFTER_SEARCH_MODES = ['radio', 'continue']

// Queue-entry bookkeeping lives on the track objects as non-enumerable-looking
// fields (they are serialisable, so they survive an IndexedDB round trip).
export const QUEUE_SOURCE_FIELD = '__source'
export const QUEUE_EXPLICIT_FIELD = '__explicit'
export const QUEUE_CATEGORY_FIELD = '__radioCategory'

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// "After search play: Related radio (default) / Continue search list".
// Anything unknown (fresh install, corrupt storage, older build) is radio.
export function normalizeAfterSearch(value) {
  return value === 'continue' ? 'continue' : 'radio'
}

export function afterSearchStorageValue(value) {
  return normalizeAfterSearch(value)
}

// ---------------------------------------------------------------------------
// Track metadata
// ---------------------------------------------------------------------------

// Categories as the providers give them: `category: ['Punjabi','Love']`.
// Also accepts a single string, comma/pipe/slash separated lists and the
// `categories` alias some endpoints use.
export function trackCategories(track) {
  const t = track || {}
  const raw = t.category != null ? t.category : t.categories
  const list = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' ? raw.split(/[,|/]/) : [])
  const seen = new Set()
  const out = []
  for (const value of list) {
    const s = clean(value)
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

// Multi-category tracks: the PRIMARY (first) category is the radio seed.
// A leading generic "All" is skipped because it seeds an arbitrary mix, and
// "All" is only used when it is genuinely the track's only category.
export function primaryCategory(track) {
  const cats = trackCategories(track)
  return cats.find(c => c.toLowerCase() !== 'all') || cats[0] || ''
}

// Is this a track identity we can reason about? Guards restored queues and
// radio pools against partial provider rows.
export function isQueueable(track) {
  if (!track || typeof track !== 'object') return false
  const id = clean(track.id || track.videoId || track.audio)
  if (!id) return false
  return Boolean(clean(track.title))
}

// ---------------------------------------------------------------------------
// Labels — the source chip shown on queue rows
// ---------------------------------------------------------------------------

function titleCaseWord(word) {
  if (!word) return ''
  if (/^[0-9]/.test(word)) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export function titleCaseWords(value) {
  return clean(value).split(' ').filter(Boolean).map(titleCaseWord).join(' ')
}

// "sad love" -> "Sad Love radio"; empty seed -> "Radio".
export function radioLabel(seed) {
  const s = clean(seed)
  return s ? `${titleCaseWords(s)} radio` : 'Radio'
}

export function searchLabel(query) {
  const q = clean(query)
  return q ? `Search: ${q}` : 'Search'
}

// ---------------------------------------------------------------------------
// Related categories (fallback when the seed category is exhausted)
// ---------------------------------------------------------------------------

// Curated relatives for the moods/languages the app actually ships. Values are
// the category names the existing /api/tracks?category= endpoint understands.
const RELATED_HINTS = {
  'sad love': ['Love', 'Sad', 'Hindi', 'Bollywood'],
  'sad': ['Sad Love', 'Love', 'Hindi'],
  'romantic': ['Love', 'Sad Love', 'Hindi', 'Bollywood'],
  'romance': ['Love', 'Sad Love', 'Hindi', 'Bollywood'],
  'love': ['Sad Love', 'Romantic', 'Hindi', 'Bollywood'],
  'hindi': ['Bollywood', 'Love', '90s'],
  'bollywood': ['Hindi', 'Love', '90s'],
  'punjabi': ['Hindi', 'Trending', 'Love'],
  '90s': ['Bollywood', 'Hindi', 'Love'],
  'indie': ['Hindi', 'Love', 'All'],
  'trending': ['All', 'Hindi', 'Punjabi'],
  'new': ['Trending', 'Hindi', 'Punjabi'],
  'party': ['Punjabi', 'Trending', 'Bollywood'],
  'chill': ['Indie', 'Love', 'All'],
  'workout': ['Punjabi', 'Trending', 'Bollywood'],
}

const GENERIC_RELATED = ['Love', 'Hindi', 'Bollywood', 'Trending', '90s', 'Punjabi', 'Indie', 'New', 'All']

// Ordered, de-duplicated fallback categories for a seed. Sibling categories on
// the seed track come first (a ["Punjabi","Sad Love"] track can radio into
// Punjabi), then curated relatives, then a generic safety net.
export function relatedCategories(seed, siblingCategories = []) {
  const seedKey = clean(seed).toLowerCase()
  const seen = new Set(seedKey ? [seedKey] : [])
  const out = []
  const push = (value) => {
    const s = clean(value)
    if (!s) return
    const key = s.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(s)
  }
  for (const c of Array.isArray(siblingCategories) ? siblingCategories : []) push(c)
  if (seedKey) {
    if (RELATED_HINTS[seedKey]) {
      for (const c of RELATED_HINTS[seedKey]) push(c)
    } else {
      // "sad love songs" / "bollywood sad" — match the longest known hint.
      const hint = Object.keys(RELATED_HINTS)
        .filter(k => seedKey.includes(k) || k.includes(seedKey))
        .sort((a, b) => b.length - a.length)[0]
      if (hint) for (const c of RELATED_HINTS[hint]) push(c)
    }
  }
  for (const c of GENERIC_RELATED) push(c)
  return out
}

// Seed category first, then every related fallback.
export function radioCategoryOrder(seed, siblingCategories = []) {
  const order = []
  const seen = new Set()
  const push = (value) => {
    const s = clean(value)
    if (!s) return
    const key = s.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    order.push(s)
  }
  push(seed)
  for (const c of relatedCategories(seed, siblingCategories)) push(c)
  return order
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

export function normalizeContext(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    return { kind: 'radio', id: '', label: 'Radio', seed: '', auto: false, origin: null }
  }
  const kind = CONTEXT_KINDS.includes(ctx.kind) ? ctx.kind : 'radio'
  const seed = clean(ctx.seed)
  const id = clean(ctx.id)
  const fallback = kind === 'search'
    ? searchLabel(id)
    : kind === 'radio'
      ? radioLabel(seed)
      : (titleCaseWords(id) || 'Queue')
  const origin = ctx.origin && typeof ctx.origin === 'object'
    ? normalizeContext({ ...ctx.origin, origin: null })
    : null
  return {
    kind,
    id,
    label: clean(ctx.label) || fallback,
    seed,
    auto: ctx.auto === true,
    origin,
  }
}

// Radio context seeded by a track's primary category. `origin` keeps the
// surface the user actually played from, so its row can say "Search: dooriyan"
// while every following row says "Sad Love radio".
export function radioContext(track, { origin = null, auto = true } = {}) {
  const seed = primaryCategory(track)
  return normalizeContext({
    kind: 'radio',
    id: seed,
    seed,
    label: radioLabel(seed),
    auto,
    origin,
  })
}

// Contexts for a play that does NOT opt into radio (any play that arrives
// without an explicit source keeps the pre-133 continuation semantics).
export function legacyContext(track) {
  const seed = primaryCategory(track)
  return normalizeContext({ kind: 'radio', id: seed, seed, label: radioLabel(seed), auto: false })
}

export function contextForPlay(kind, { track = null, id = '', label = '', seed = '' } = {}) {
  switch (kind) {
    case 'search':
      return normalizeContext({ kind, id: id || label, label: searchLabel(id || label), auto: false })
    case 'category':
      return normalizeContext({ kind, id, label: titleCaseWords(label || id), auto: false })
    case 'playlist':
      return normalizeContext({ kind, id, label: label || 'Playlist', auto: false })
    case 'album':
      return normalizeContext({ kind, id, label: label || 'Album', auto: false })
    case 'radio':
    default:
      return radioContext(track, { auto: true })
  }
}

// 'list'  -> auto-advance stays inside the queue we were given (unchanged)
// 'radio' -> the chosen track is alone and the next auto track is radio
export function modeForContext(ctx, afterSearch = 'radio') {
  const c = normalizeContext(ctx)
  if (c.kind === 'radio' || (c.kind === 'search' && c.auto)) return 'radio'
  if (c.kind === 'search') return normalizeAfterSearch(afterSearch) === 'continue' ? 'list' : 'radio'
  return 'list'
}

// Whether radio may supply the next auto track for a context. Legacy contexts
// (a plain tap with no known source) keep auto=false so their advance flow is
// untouched; radio contexts are created with auto=true.
export function radioEligible(ctx, afterSearch = 'radio') {
  const c = normalizeContext(ctx)
  if (c.kind === 'radio') return c.auto === true
  if (c.kind === 'search') return c.auto === true || normalizeAfterSearch(afterSearch) === 'radio'
  return false
}

// ---------------------------------------------------------------------------
// Queue entries
// ---------------------------------------------------------------------------

export function stampTrack(track, source, extra = {}) {
  if (!track || typeof track !== 'object') return track
  return { ...track, [QUEUE_SOURCE_FIELD]: clean(source), ...extra }
}

export function trackSource(track) {
  return clean(track && track[QUEUE_SOURCE_FIELD])
}

export function isExplicit(track) {
  return Boolean(track && track[QUEUE_EXPLICIT_FIELD])
}

// "Sad Love radio" / "Search: dooriyan" / playlist name, falling back to the
// active context label so every queue row carries a source chip.
export function chipLabel(track, context = null) {
  const own = trackSource(track)
  if (own) return own
  if (!context) return ''
  const c = normalizeContext(context)
  return c.label || ''
}

// "Play next" inserts directly after the current row; manual adds append.
// Both are marked explicit so auto-radio can never jump ahead of them.
export function insertPlayNext(queue, index, track, source = 'Play next') {
  const list = Array.isArray(queue) ? queue.slice() : []
  const at = Math.max(0, Math.min(Number(index) || 0, Math.max(0, list.length - 1))) + 1
  list.splice(at, 0, stampTrack(track, source, { [QUEUE_EXPLICIT_FIELD]: true }))
  return list
}

export function appendToQueue(queue, track, source = 'Added to queue') {
  const list = Array.isArray(queue) ? queue.slice() : []
  list.push(stampTrack(track, source, { [QUEUE_EXPLICIT_FIELD]: true }))
  return list
}

// ---------------------------------------------------------------------------
// Radio selection
// ---------------------------------------------------------------------------

function shuffleWith(list, random) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

function identityKey(track, keyOf) {
  if (typeof keyOf === 'function') return clean(keyOf(track))
  return clean((track && (track.id || track.videoId)) || '')
}

// Choose shuffled radio tracks from per-category pools.
//
//  - `order` is the category order to try: [seed, ...related].
//  - `history` (recently played) and `exclude` (already queued) are removed by
//    track identity, so radio never repeats what the user just heard.
//  - when the seed pool runs dry the NEXT category in `order` supplies the
//    tracks (category-exhaustion fallback); `usedCategories` reports which
//    pools actually produced something.
//
// Returns stamped entries ({ ...track, __source: '<Cat> radio' }) so the queue
// screen can render a source chip per row.
export function pickRadioTracks({
  poolByCategory = {},
  order = [],
  history = [],
  exclude = [],
  limit = 4,
  keyOf = null,
  random = Math.random,
  labelOf = radioLabel,
} = {}) {
  const keyFor = (track) => identityKey(track, keyOf)
  const historyKeys = new Set((Array.isArray(history) ? history : []).map(t => keyFor(t)).filter(Boolean))
  const excludeKeys = new Set((Array.isArray(exclude) ? exclude : []).map(t => keyFor(t)).filter(Boolean))
  const picked = []
  const usedCategories = []
  const seen = new Set()

  for (const category of Array.isArray(order) ? order : []) {
    if (picked.length >= limit) break
    const pool = Array.isArray(poolByCategory[category]) ? poolByCategory[category] : []
    if (!pool.length) continue
    const candidates = []
    for (const track of pool) {
      if (!isQueueable(track)) continue
      const key = keyFor(track)
      if (!key || seen.has(key) || historyKeys.has(key) || excludeKeys.has(key)) continue
      seen.add(key)
      candidates.push(track)
    }
    if (!candidates.length) continue
    const shuffled = shuffleWith(candidates, random)
    const take = shuffled.slice(0, Math.max(0, limit - picked.length))
    for (const track of take) {
      picked.push(stampTrack(track, labelOf(category), { [QUEUE_CATEGORY_FIELD]: category }))
    }
    if (take.length) usedCategories.push(category)
  }

  return { tracks: picked, usedCategories }
}

// ---------------------------------------------------------------------------
// Session resolution — what the queue becomes when a row is tapped
// ---------------------------------------------------------------------------

// Pure decision used by App.playTrack. It never mutates the caller's list and
// never returns the remaining search results as the queue in radio mode.
//
// Modes:
//   'list'    -> queue is the tapped list, index is the tapped track (pre-133)
//   'radio'   -> queue is exactly the tapped track; radio supplies the rest
//   'legacy'  -> no explicit context: keep the old "continue whatever list" flow
export function resolvePlaySession({
  track,
  list = null,
  context = null,
  afterSearch = 'radio',
  keyOf = null,
} = {}) {
  const keyFor = (t) => identityKey(t, keyOf)
  const trackKey = keyFor(track)
  const given = Array.isArray(list) ? list.filter(Boolean) : []
  const hasTrack = given.some(t => keyFor(t) === trackKey)
  const base = hasTrack ? given.slice() : [track, ...given]
  const baseIndex = Math.max(0, base.findIndex(t => keyFor(t) === trackKey))

  if (!context) {
    return { mode: 'legacy', context: legacyContext(track), tracks: base, index: baseIndex, prepended: !hasTrack }
  }

  const ctx = normalizeContext(context)
  if (modeForContext(ctx, afterSearch) === 'radio') {
    const origin = ctx.kind === 'search' ? ctx : null
    const source = ctx.kind === 'search' ? ctx.label : (ctx.label || radioLabel(ctx.seed))
    return {
      mode: 'radio',
      context: radioContext(track, { origin, auto: true }),
      tracks: [stampTrack(track, source)],
      index: 0,
      prepended: false,
    }
  }

  return {
    mode: 'list',
    context: ctx,
    tracks: base.map(t => stampTrack(t, trackSource(t) || ctx.label)),
    index: baseIndex,
    prepended: !hasTrack,
  }
}
