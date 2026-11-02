import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CONTEXT_KINDS,
  normalizeAfterSearch,
  afterSearchStorageValue,
  trackCategories,
  primaryCategory,
  radioLabel,
  titleCaseWords,
  searchLabel,
  relatedCategories,
  radioCategoryOrder,
  normalizeContext,
  radioContext,
  legacyContext,
  contextForPlay,
  modeForContext,
  radioEligible,
  pickRadioTracks,
  resolvePlaySession,
  insertPlayNext,
  appendToQueue,
  chipLabel,
  trackSource,
  isExplicit,
} from '../src/lib/playbackcontext.js'
import { sanitizePlaybackState, PLAYBACK_SCHEMA, PLAYBACK_QUEUE_MAX } from '../src/lib/db.js'

// Same identity rule the player uses (trackmeta.trackKeyOf) reduced to its two
// stable branches — YouTube videoId first, then the provider id.
const keyOf = (t) => t && (t.videoId ? `yt:${t.videoId}` : (t.id ? `id:${t.id}` : ''))
let seq = 0
const track = (id, category, extra = {}) => ({
  id,
  title: `Song ${id}`,
  artist: 'Test artist',
  audio: `https://music.test/${id}.mp3`,
  category,
  ...extra,
})
const fresh = (id, category, extra) => track(`${id}-${++seq}`, category, extra)

// ---------------------------------------------------------------------------
// Seed / label semantics
// ---------------------------------------------------------------------------

test('radio seed: multi-category tracks use the PRIMARY (first) category', () => {
  assert.equal(primaryCategory(track('a', ['sad love', 'Hindi'])), 'sad love')
  assert.equal(primaryCategory(track('b', 'Punjabi / Love')), 'Punjabi')
  // A leading generic collection bucket never becomes the seed when a real
  // category exists, but "All" is used when it is all the track has.
  assert.equal(primaryCategory(track('c', ['All', 'Punjabi'])), 'Punjabi')
  assert.equal(primaryCategory(track('d', ['All'])), 'All')
  assert.equal(primaryCategory({}), '')
  assert.deepEqual(trackCategories(track('e', ['Hindi', 'Hindi', 'Love'])), ['Hindi', 'Love'])
})

test('radio label: "sad love" seeds "Sad Love radio"; empty seed stays "Radio"', () => {
  assert.equal(radioLabel('sad love'), 'Sad Love radio')
  assert.equal(radioLabel('Hindi'), 'Hindi radio')
  assert.equal(radioLabel(''), 'Radio')
  assert.equal(titleCaseWords('90s love'), '90s Love')
  assert.equal(searchLabel('dooriyan - love aaj kal'), 'Search: dooriyan - love aaj kal')
  assert.equal(searchLabel('  '), 'Search')
})

// ---------------------------------------------------------------------------
// search -> radio seed
// ---------------------------------------------------------------------------

test('search play (radio default): queue is the chosen track only, seeded by its category', () => {
  const chosen = track('dooriyan', ['sad love', 'Hindi'])
  const searchList = [chosen, fresh('result2', ['Hindi']), fresh('result3', ['Hindi'])]
  const session = resolvePlaySession({
    track: chosen,
    list: searchList,
    context: contextForPlay('search', { id: 'dooriyan - love aaj kal' }),
    afterSearch: 'radio',
    keyOf,
  })
  assert.equal(session.mode, 'radio')
  assert.deepEqual(session.tracks.map(t => t.id), ['dooriyan'], 'the raw search list must never become the queue')
  assert.equal(session.index, 0)
  assert.equal(session.context.kind, 'radio')
  assert.equal(session.context.seed, 'sad love')
  assert.equal(session.context.label, 'Sad Love radio')
  assert.equal(session.context.auto, true, 'radio filling stays enabled for the rest of the session')
  assert.equal(session.context.origin.kind, 'search')
  assert.equal(session.context.origin.label, 'Search: dooriyan - love aaj kal')
  assert.equal(trackSource(session.tracks[0]), 'Search: dooriyan - love aaj kal')
})

test('search play honours the context label even when the query is empty', () => {
  const chosen = track('x', ['Love'])
  const session = resolvePlaySession({ track: chosen, list: [chosen], context: contextForPlay('search', {}), afterSearch: 'radio', keyOf })
  assert.equal(session.mode, 'radio')
  assert.equal(session.context.origin.label, 'Search')
  assert.equal(trackSource(session.tracks[0]), 'Search')
})

test('"Continue search list" restores the old behaviour (list + position preserved)', () => {
  const chosen = track('dooriyan', ['sad love'])
  const list = [fresh('a', ['Hindi']), chosen, fresh('b', ['Hindi'])]
  const session = resolvePlaySession({
    track: chosen,
    list,
    context: contextForPlay('search', { id: 'dooriyan' }),
    afterSearch: 'continue',
    keyOf,
  })
  assert.equal(session.mode, 'list')
  assert.deepEqual(session.tracks.map(t => t.id), list.map(t => t.id))
  assert.equal(session.index, 1)
  assert.equal(session.context.kind, 'search')
  assert.equal(session.context.auto, false)
  assert.equal(trackSource(session.tracks[1]), 'Search: dooriyan')
  assert.equal(radioEligible(session.context, 'continue'), false)
})

test('After-search preference: only the exact "continue" value keeps the old mode', () => {
  assert.equal(normalizeAfterSearch('continue'), 'continue')
  assert.equal(normalizeAfterSearch('radio'), 'radio')
  assert.equal(normalizeAfterSearch(undefined), 'radio')
  assert.equal(normalizeAfterSearch('CONTINUE'), 'radio')
  assert.equal(afterSearchStorageValue('continue'), 'continue')
  assert.equal(afterSearchStorageValue(2), 'radio')
  const searchCtx = contextForPlay('search', { id: 'x' })
  assert.equal(modeForContext(searchCtx, 'radio'), 'radio')
  assert.equal(modeForContext(searchCtx, 'continue'), 'list')
})

// ---------------------------------------------------------------------------
// playlist -> playlist / category -> category / album -> album
// ---------------------------------------------------------------------------

test('playlist play continues the playlist (unchanged behaviour)', () => {
  const p1 = track('p1', ['Punjabi'])
  const p2 = fresh('p2', ['Punjabi'])
  const p3 = fresh('p3', ['Punjabi'])
  const session = resolvePlaySession({
    track: p2,
    list: [p1, p2, p3],
    context: contextForPlay('playlist', { id: 'pl-1', label: 'Road Trip' }),
    afterSearch: 'radio',
    keyOf,
  })
  assert.equal(session.mode, 'list')
  assert.equal(session.context.kind, 'playlist')
  assert.equal(session.context.label, 'Road Trip')
  // The whole playlist stays queued and the tapped row is current — so the
  // next auto-advance is playlist track #3, never radio.
  assert.deepEqual(session.tracks.map(t => t.id), [p1.id, p2.id, p3.id])
  assert.equal(session.index, 1)
  assert.deepEqual(session.tracks.map(trackSource), ['Road Trip', 'Road Trip', 'Road Trip'])
  assert.equal(modeForContext(session.context, 'radio'), 'list')
  assert.equal(radioEligible(session.context, 'radio'), false)
})

test('category and album contexts stay inside their own list', () => {
  const c1 = track('c1', ['Hindi'])
  const c2 = fresh('c2', ['Hindi'])
  const cat = resolvePlaySession({ track: c1, list: [c1, c2], context: contextForPlay('category', { id: 'Hindi' }), afterSearch: 'radio', keyOf })
  assert.equal(cat.mode, 'list')
  assert.equal(cat.context.kind, 'category')
  assert.equal(cat.context.label, 'Hindi')
  assert.deepEqual(cat.tracks.map(t => t.id), [c1.id, c2.id])
  assert.equal(radioEligible(cat.context, 'radio'), false)

  const album = resolvePlaySession({ track: c1, list: [c1], context: contextForPlay('album', { id: 'a', label: 'Brahmastra' }), afterSearch: 'radio', keyOf })
  assert.equal(album.mode, 'list')
  assert.equal(album.context.kind, 'album')
  assert.equal(chipLabel(album.tracks[0], album.context), 'Brahmastra')
})

test('a tap without a known source keeps the pre-133 queue continuation', () => {
  const q1 = track('q1', ['Love'])
  const q2 = fresh('q2', ['Love'])
  const session = resolvePlaySession({ track: q1, list: [q1, q2], keyOf })
  assert.equal(session.mode, 'legacy')
  assert.deepEqual(session.tracks.map(t => t.id), [q1.id, q2.id])
  assert.equal(session.index, 0)
  assert.equal(session.context.auto, false, 'legacy contexts never silently start radio')
  assert.equal(radioEligible(session.context, 'radio'), false)
  // A track that is not in the list is still prepended (existing behaviour).
  const prepended = resolvePlaySession({ track: fresh('z', ['Love']), list: [q1, q2], keyOf })
  assert.equal(prepended.index, 0)
  assert.equal(prepended.tracks.length, 3)
  assert.equal(prepended.prepended, true)
})

test('context kinds and normalisation are migration-safe', () => {
  assert.deepEqual(CONTEXT_KINDS, ['search', 'category', 'playlist', 'album', 'radio'])
  const junk = normalizeContext({ kind: 'nonsense', label: '  ', seed: null, auto: 'yes' })
  assert.equal(junk.kind, 'radio')
  assert.equal(junk.label, 'Radio')
  assert.equal(junk.auto, false, 'auto must be a real boolean, never a truthy string')
  assert.equal(normalizeContext(null).kind, 'radio')
  assert.equal(normalizeContext(undefined).kind, 'radio')
  const legacy = legacyContext(track('l', ['sad love']))
  assert.equal(legacy.kind, 'radio')
  assert.equal(legacy.seed, 'sad love')
  assert.equal(legacy.auto, false)
  const radio = radioContext(track('r', ['sad love']))
  assert.equal(radio.label, 'Sad Love radio')
  assert.equal(radio.auto, true)
})

// ---------------------------------------------------------------------------
// Explicit queue actions outrank radio
// ---------------------------------------------------------------------------

test('explicit "play next" lands immediately after the current row and outranks radio', () => {
  const current = track('now', ['sad love'])
  const upcoming = fresh('later', ['sad love'])
  const manual = fresh('manual', ['sad love'])
  let queue = [current, upcoming]
  queue = insertPlayNext(queue, 0, manual)
  assert.deepEqual(queue.map(t => t.id), ['now', manual.id, upcoming.id])
  assert.equal(trackSource(queue[1]), 'Play next')
  assert.equal(isExplicit(queue[1]), true)
  assert.equal(queue[1].__source, 'Play next')

  const appended = appendToQueue(queue, fresh('manual2', ['sad love']))
  assert.equal(trackSource(appended.at(-1)), 'Added to queue')
  assert.equal(isExplicit(appended.at(-1)), true)

  // Radio is appended AFTER everything the user asked for, and never re-adds
  // a row that is already queued.
  const pool = [queue[0], queue[1], upcoming, fresh('radio1', ['sad love']), fresh('radio2', ['sad love'])]
  const pick = pickRadioTracks({ poolByCategory: { 'sad love': pool }, order: ['sad love'], exclude: appended, keyOf, random: () => 0 })
  assert.deepEqual(pick.tracks.map(t => t.id).sort(), [pool[3].id, pool[4].id].sort())
  const final = [...appended, ...pick.tracks]
  assert.deepEqual(final.slice(0, 2).map(t => t.id), ['now', queue[1].id])
  assert.equal(isExplicit(final[1]), true)
  assert.equal(trackSource(final[1]), 'Play next')
  // every radio row sits after ALL explicit rows and is never marked explicit
  const firstRadio = final.findIndex(t => trackSource(t) === 'Sad Love radio')
  assert.ok(firstRadio > final.findIndex(t => trackSource(t) === 'Added to queue'))
  assert.ok(final.slice(firstRadio).every(t => !isExplicit(t) && trackSource(t) === 'Sad Love radio'))
})

test('appending explicit rows to an empty queue is safe', () => {
  const only = insertPlayNext([], 0, track('solo', ['Love']))
  assert.equal(only.length, 1)
  assert.equal(only[0].id, 'solo')
  const added = appendToQueue([], track('solo2', ['Love']))
  assert.equal(added.length, 1)
})

// ---------------------------------------------------------------------------
// History dedupe
// ---------------------------------------------------------------------------

test('radio skips anything already played (history dedupe) or already queued', () => {
  const a = track('r1', ['sad love'])
  const b = fresh('r2', ['sad love'])
  const c = fresh('r3', ['sad love'])
  const d = fresh('r4', ['sad love'])
  const pick = pickRadioTracks({
    poolByCategory: { 'sad love': [a, b, c, d] },
    order: ['sad love'],
    history: [a, b],
    exclude: [c],
    keyOf,
    random: () => 0,
  })
  assert.deepEqual(pick.tracks.map(t => t.id), [d.id])
  assert.equal(trackSource(pick.tracks[0]), 'Sad Love radio')
  assert.equal(pick.tracks[0].__radioCategory, 'sad love')
  assert.deepEqual(pick.usedCategories, ['sad love'])
})

test('history matching is identity-based, not array-reference based', () => {
  const a = track('same', ['Love'])
  const copy = { ...a, title: 'Same song, fresh provider row' }
  const pick = pickRadioTracks({ poolByCategory: { Love: [copy, fresh('other', ['Love'])] }, order: ['Love'], history: [a], keyOf, random: () => 0 })
  assert.equal(pick.tracks.length, 1)
  assert.notEqual(pick.tracks[0].id, 'same')
})

// ---------------------------------------------------------------------------
// Category exhaustion fallback
// ---------------------------------------------------------------------------

test('radioCategoryOrder: seed first, then related categories, no duplicates', () => {
  const order = radioCategoryOrder('sad love', ['sad love', 'Hindi'])
  assert.equal(order[0], 'sad love')
  assert.equal(order[1], 'Hindi')
  for (const expected of ['Love', 'Sad', 'Bollywood']) assert.ok(order.includes(expected), `${expected} should be a fallback`)
  const lower = order.map(c => c.toLowerCase())
  assert.equal(new Set(lower).size, lower.length, 'fallbacks are de-duplicated case-insensitively')
  assert.ok(!relatedCategories('sad love').some(c => c.toLowerCase() === 'sad love'))
})

test('exhausted seed category falls back to the next related category', () => {
  const seedOnly = [] // "sad love" pool empty for this user
  const love = [fresh('l1', ['Love']), fresh('l2', ['Love'])]
  const order = radioCategoryOrder('sad love')
  const pick = pickRadioTracks({
    poolByCategory: { 'sad love': seedOnly, Love: love },
    order,
    history: [],
    exclude: [],
    limit: 2,
    keyOf,
    random: () => 0,
  })
  assert.equal(pick.tracks.length, 2)
  assert.deepEqual(pick.usedCategories, ['Love'])
  assert.deepEqual(pick.tracks.map(trackSource), ['Love radio', 'Love radio'])
  assert.deepEqual(pick.tracks.map(t => t.id).sort(), love.map(t => t.id).sort())
})

test('fallback after the seed and its immediate relative are both exhausted', () => {
  const order = radioCategoryOrder('sad love')
  const hindi = [fresh('h1', ['Hindi'])]
  const pick = pickRadioTracks({
    poolByCategory: { 'sad love': [], Love: [track('played', ['Love'])], Hindi: hindi },
    order,
    history: [track('played', ['Love'])],
    keyOf,
    random: () => 0,
  })
  assert.deepEqual(pick.usedCategories, ['Hindi'])
  assert.equal(pick.tracks[0].id, hindi[0].id)
})

test('every category exhausted => no radio tracks (caller stops cleanly)', () => {
  const pick = pickRadioTracks({ poolByCategory: { 'sad love': [], Love: [] }, order: radioCategoryOrder('sad love'), keyOf, random: () => 0 })
  assert.deepEqual(pick.tracks, [])
  assert.deepEqual(pick.usedCategories, [])
})

test('radio picks are shuffled, de-duplicated and capped at the limit', () => {
  const pool = Array.from({ length: 8 }, (_, i) => fresh(`pool${i}`, ['sad love']))
  const low = pickRadioTracks({ poolByCategory: { 'sad love': pool }, order: ['sad love'], limit: 3, keyOf, random: () => 0 })
  const high = pickRadioTracks({ poolByCategory: { 'sad love': pool }, order: ['sad love'], limit: 3, keyOf, random: () => 0.9999 })
  assert.equal(low.tracks.length, 3)
  assert.equal(high.tracks.length, 3)
  assert.notDeepEqual(low.tracks.map(t => t.id), high.tracks.map(t => t.id), 'order depends on the shuffle source')
  assert.equal(new Set(low.tracks.map(t => t.id)).size, 3)
  const all = pickRadioTracks({ poolByCategory: { 'sad love': [...pool, pool[0]] }, order: ['sad love'], limit: 20, keyOf, random: () => 0.4 })
  assert.equal(all.tracks.length, 8, 'duplicate rows are collapsed')
})

test('radio ignores unplayable provider rows', () => {
  const pick = pickRadioTracks({
    poolByCategory: { Love: [{ title: '' }, { id: 'no-title' }, null, { id: 'ok', title: 'Fine', audio: 'https://x/ok.mp3' }] },
    order: ['Love'],
    keyOf,
    random: () => 0,
  })
  assert.deepEqual(pick.tracks.map(t => t.id), ['ok'])
})

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

test('chip label: the row source wins, then the active context', () => {
  const ctx = normalizeContext({ kind: 'radio', seed: 'sad love', label: 'Sad Love radio', auto: true })
  assert.equal(chipLabel(track('a', ['sad love']), ctx), 'Sad Love radio')
  assert.equal(chipLabel({ ...track('b', ['sad love']), __source: 'Search: dooriyan' }, ctx), 'Search: dooriyan')
  assert.equal(chipLabel(track('c', []), null), '')
  assert.equal(chipLabel({ ...track('d', []), __source: 'Road Trip' }, normalizeContext(contextForPlay('playlist', { id: 'p', label: 'Road Trip' }))), 'Road Trip')
})

// ---------------------------------------------------------------------------
// Persisted session sanitising (db.js)
// ---------------------------------------------------------------------------

test('persisted session: valid records round-trip, index is clamped', () => {
  const state = sanitizePlaybackState({
    schema: PLAYBACK_SCHEMA,
    queue: [track('a', ['Love']), track('b', ['Love'])],
    index: 99,
    context: { kind: 'search', id: 'dooriyan', label: 'Search: dooriyan', auto: false },
    afterSearch: 'continue',
  })
  assert.equal(state.index, 1)
  assert.equal(state.context.kind, 'search')
  assert.equal(state.afterSearch, 'continue')
  assert.equal(state.queue.length, 2)
})

test('persisted session: corrupt/foreign records are ignored, never thrown', () => {
  assert.equal(sanitizePlaybackState(null), null)
  assert.equal(sanitizePlaybackState({ queue: [] }), null)
  assert.equal(sanitizePlaybackState({ queue: [{ id: 'x' }] }), null, 'rows without a title are dropped')
  assert.equal(sanitizePlaybackState({ schema: PLAYBACK_SCHEMA + 1, queue: [track('a', ['Love'])] }), null, 'unknown future schema is ignored')
  assert.equal(sanitizePlaybackState('garbage'), null)
})

test('persisted session: blob audio is stripped and the queue is capped', () => {
  const blobs = [track('b1', ['Love'], { audio: 'blob:https://maxmusic.test/abc' })]
  const state = sanitizePlaybackState({ queue: blobs, index: 0 })
  assert.equal(state.queue[0].audio, null, 'a dead blob URL must not be restored')
  const many = Array.from({ length: PLAYBACK_QUEUE_MAX + 30 }, (_, i) => track(`q${i}`, ['Love']))
  const capped = sanitizePlaybackState({ queue: many, index: many.length - 1 })
  assert.equal(capped.queue.length, PLAYBACK_QUEUE_MAX)
  assert.ok(capped.index <= PLAYBACK_QUEUE_MAX - 1)
})
