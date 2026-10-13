import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COVER_PLACEHOLDER, normalizeMetaText, normalizeCoverUrl, trackKeyOf,
  createTrackTracker, coverCandidates, nativeArtUrl, activeEngine, buildSnapshot,
} from '../src/lib/trackmeta.js'

// itrace-29 regression suite for the build-109 "labels/artwork + notification"
// breakage: artwork URL normalization, candidate chains, track identity /
// generation, snapshot position preservation, and stale-writer rejection in
// the JS now-playing mirror. Native (Java) behaviour is guarded by CI compile
// + the phone checklist — these tests never claim live SystemUI verification.

test('normalizeCoverUrl upgrades and cleans real-world cover formats', () => {
  assert.equal(
    normalizeCoverUrl('http://c.saavncdn.com/752/Album-Hindi-2023-150x150.jpg'),
    'https://c.saavncdn.com/752/Album-Hindi-2023-500x500.jpg')
  assert.equal(
    normalizeCoverUrl('//c.saavncdn.com/045/X-150x150.jpg'),
    'https://c.saavncdn.com/045/X-500x500.jpg')
  assert.equal(
    normalizeCoverUrl('https://c.saavncdn.com/194/X-500x500.jpg'),
    'https://c.saavncdn.com/194/X-500x500.jpg')
  assert.equal(
    normalizeCoverUrl('https://i.ytimg.com/vi/abc123/hqdefault.jpg?foo=1&amp;bar=2'),
    'https://i.ytimg.com/vi/abc123/hqdefault.jpg?foo=1&bar=2')
})

test('normalizeCoverUrl rejects anything a bitmap decoder cannot use', () => {
  assert.equal(normalizeCoverUrl(''), '')
  assert.equal(normalizeCoverUrl(null), '')
  assert.equal(normalizeCoverUrl('not a url'), '')
  assert.equal(normalizeCoverUrl('data:image/svg+xml;utf8,<svg/>'), '')
  assert.equal(normalizeCoverUrl('data:image/jpeg;base64,AAAA'), '')
  assert.equal(normalizeCoverUrl('blob:https://localhost/1234'), '')
  assert.equal(normalizeCoverUrl('https://example.com/cover.svg'), '')
})

test('YouTube tracks always get the canonical same-video thumbnail first', () => {
  const list = coverCandidates({
    videoId: 'dQw4w9WgXcQ',
    cover: 'https://pipedproxy.some-instance.example/vi/dQw4w9WgXcQ/hq720.jpg?host=i.ytimg.com',
  })
  assert.equal(list[0], 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg')
  assert.equal(list[1], 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  assert.equal(list[list.length - 1], COVER_PLACEHOLDER)
  assert.ok(!list.some(u => /unsplash/i.test(u)), 'never substitute a stock/other-song image')
})

test('Saavn track candidates: normalized CDN cover, then local placeholder', () => {
  const list = coverCandidates({ cover: 'http://c.saavncdn.com/232/Song-150x150.jpg', videoId: null })
  assert.deepEqual(list, ['https://c.saavncdn.com/232/Song-500x500.jpg', COVER_PLACEHOLDER])
})

test('track with no usable cover gets only the neutral placeholder', () => {
  assert.deepEqual(coverCandidates({ cover: '' }), [COVER_PLACEHOLDER])
  assert.deepEqual(coverCandidates({ cover: 'data:image/svg+xml;utf8,x' }), [COVER_PLACEHOLDER])
  assert.equal(nativeArtUrl({ cover: '' }), '')
  assert.equal(nativeArtUrl({ cover: COVER_PLACEHOLDER }), '')
})

test('nativeArtUrl is always https raster, never data/SVG', () => {
  assert.equal(
    nativeArtUrl({ videoId: 'abc123', cover: 'https://piped.example/thumb.jpg' }),
    'https://i.ytimg.com/vi/abc123/mqdefault.jpg')
  assert.equal(
    nativeArtUrl({ cover: 'http://c.saavncdn.com/1/A-150x150.jpg' }),
    'https://c.saavncdn.com/1/A-500x500.jpg')
})

test('track identity: videoId wins, A→B→A generations always advance', () => {
  const tr = createTrackTracker()
  const a = { id: 'x1', videoId: 'vidA', title: 'Song A' }
  const b = { id: 'y2', videoId: null, title: 'Song B', artist: 'Someone' }
  assert.equal(trackKeyOf(a), 'yt:vidA')
  assert.deepEqual(tr.update(a), { key: 'yt:vidA', gen: 1, changed: true })
  assert.deepEqual(tr.update(a), { key: 'yt:vidA', gen: 1, changed: false })
  assert.equal(tr.update(b).gen, 2)
  const back = tr.update(a)
  assert.equal(back.gen, 3)
  assert.equal(back.changed, true)
})

test('same song keeps its generation across metadata-only refreshes', () => {
  const tr = createTrackTracker()
  const t = { id: 'saavn-1', title: 'Tum Hi Ho', artist: 'Arijit Singh' }
  const g1 = tr.update(t).gen
  assert.equal(tr.update({ ...t, cover: 'https://c.saavncdn.com/1/A-500x500.jpg' }).gen, g1)
})

test('activeEngine: direct-audio YouTube and Saavn are audio, iframe is yt', () => {
  assert.equal(activeEngine({ videoId: 'v1' }, ''), 'yt')
  assert.equal(activeEngine({ videoId: 'v1' }, 'https://cdn.example/a.mp3'), 'audio')
  assert.equal(activeEngine({ videoId: 'v1', audio: 'https://aac.saavncdn.com/x_320.mp4' }, ''), 'audio')
  assert.equal(activeEngine({ videoId: null, audio: 'https://x/y.mp3' }, ''), 'audio')
})

test('snapshot preserves position/duration through pause and metadata refresh', () => {
  const track = { id: 's1', title: 'A'.repeat(80), artist: 'B'.repeat(50), album: 'Alb', cover: 'http://c.saavncdn.com/9/Z-150x150.jpg', durationSec: 200 }
  const s = buildSnapshot({ track, key: 'id:s1', gen: 4, playing: false, engine: 'audio', pos: 42.4, dur: 198 })
  assert.equal(s.pos, 42.4)
  assert.equal(s.dur, 198)
  assert.equal(s.state, 'paused')
  assert.equal(s.title.length, 60) // identical crop on every channel
  assert.equal(s.artist.length, 40)
  assert.equal(s.artUrl, 'https://c.saavncdn.com/9/Z-500x500.jpg')
})

test('snapshot sanitizes bad positions and falls back to declared duration', () => {
  const track = { id: 's2', title: 'T', durationSec: 210 }
  const s = buildSnapshot({ track, key: 'id:s2', gen: 1, playing: true, engine: 'audio', pos: NaN, dur: 0 })
  assert.equal(s.pos, 0)
  assert.equal(s.dur, 210)
  const clamped = buildSnapshot({ track, key: 'id:s2', gen: 1, playing: true, engine: 'audio', pos: 9999, dur: 100 })
  assert.equal(clamped.pos, 100)
})

test('normalizeMetaText matches the native channel normalization', () => {
  assert.equal(normalizeMetaText('  A|B   C ', 60), 'A·B C')
})

// --- window.__np mirror guards (src/lib/nowplaying.js) ---
globalThis.window = {}
const { npUpdate } = await import('../src/lib/nowplaying.js')

test('npUpdate: new track replaces wholesale — no art/pos leak from old song', () => {
  window.__np = {}
  npUpdate({ key: 'yt:a', gen: 1, title: 'Song A', artist: 'X', state: 'playing', engine: 'yt', pos: 30, dur: 180, artUrl: 'https://i.ytimg.com/vi/a/hqdefault.jpg' })
  npUpdate({ key: 'id:b', gen: 2, title: 'Song B', artist: 'Y', state: 'playing', engine: 'audio', pos: 0, dur: 200, artUrl: '' })
  assert.equal(window.__np.title, 'Song B')
  assert.equal(window.__np.artUrl, '')
  assert.equal(window.__np.pos, 0)
})

test('npUpdate: metadata-only refresh never wipes a known duration', () => {
  window.__np = {}
  npUpdate({ key: 'id:b', gen: 2, title: 'Song B', state: 'playing', engine: 'audio', pos: 55, dur: 200, artUrl: '' })
  npUpdate({ key: 'id:b', gen: 2, title: 'Song B', state: 'paused', engine: 'audio', pos: 55, dur: 0, artUrl: '' })
  assert.equal(window.__np.dur, 200)
  assert.equal(window.__np.pos, 55)
  assert.equal(window.__np.playing, false)
})

test('npUpdate: a stale lower-generation snapshot is rejected', () => {
  window.__np = {}
  npUpdate({ key: 'id:new', gen: 5, title: 'New', state: 'playing', engine: 'audio', pos: 3, dur: 100, artUrl: '' })
  npUpdate({ key: 'yt:old', gen: 3, title: 'Old', state: 'playing', engine: 'yt', pos: 99, dur: 300, artUrl: 'https://i.ytimg.com/vi/old/hqdefault.jpg' })
  assert.equal(window.__np.title, 'New')
  assert.equal(window.__np.pos, 3)
})

test('npUpdate: SVG/data artwork never reaches the native mirror', () => {
  window.__np = {}
  npUpdate({ key: 'id:c', gen: 1, title: 'C', state: 'playing', engine: 'audio', pos: 0, dur: 10, artUrl: 'data:image/svg+xml;utf8,<svg/>' })
  assert.equal(window.__np.artUrl, '')
})
