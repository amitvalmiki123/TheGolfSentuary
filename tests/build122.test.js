import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

// Build 122 regression contract: the exhaustive Pal/Pehli-style Saavn search
// is for one-track playback rescue. It must never sit in front of every Home
// page again after a cache clear, or "Loading more music…" appears stuck.
const api = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('build122: category load-more does local-pool canonicalization only', () => {
  assert.match(api, /preferSaavnRecordings\(merged, 0\)/)
  assert.match(api, /preferSaavnRecordings\(first, 8, \{ timeoutMs: 1800, deadlineMs: 4000 \}\)/)
})

test('build122: category page providers load in parallel', () => {
  assert.match(api, /await Promise\.all\(\[loadBackend\(\), loadSaavn\(\), loadPiped\(\)\]\)/)
})

test('build122: bounded list lookup has a timeout and timeout is not a confirmed miss', () => {
  const start = api.indexOf('export async function preferSaavnRecordings')
  const body = api.slice(start, start + 9500)
  assert.match(body, /const boundedLookup = async/)
  assert.match(body, /withLookupTimeout\(searchSaavn\(q, 20\)/)
  assert.match(body, /if \(match !== undefined\) _saavnMatchCache\.set/)
  assert.match(body, /exhaustive\s*\? await withLookupTimeout\(findSaavnRecording/)
})

test('build122: Search trending is a dedicated feed, not the active Home list', () => {
  assert.match(app, /const \[trendingTracks, setTrendingTracks\] = useState\(\[\]\)/)
  assert.match(app, /fetchCategoryPage\('Trending', null, 24, langs\)/)
  assert.match(app, /searchPiped\('trending songs today', 18\)/)
  assert.match(app, /\(trendingTracks\.length \? trendingTracks : homeTracks\)\.slice\(0,12\)/)
  assert.ok(!app.includes('Trending Now — Worldwide Full'))
})

test('build122: Search trending rows cannot push past the mobile viewport', () => {
  const start = app.indexOf('Trending Now — India + Global')
  const body = app.slice(start, start + 2200)
  assert.match(body, /min-w-0 max-w-full overflow-hidden/)
  assert.match(body, /flex min-w-0 max-w-full overflow-hidden items-center/)
  assert.match(body, /min-w-0 flex-1/)
  assert.match(body, /w-8 h-8 shrink-0 grid place-items-center/)
})

test('build122: artist tiles auto-sync and render cached genuine portraits', () => {
  assert.match(app, /const \[artistPortraits, setArtistPortraits\]/)
  assert.match(app, /fetchArtistProfile\(name\)/)
  assert.match(app, /sur_artist_portraits/)
  assert.equal((app.match(/src=\{artistPortraitFor\(a\.name\)\}/g) || []).length, 2)
  assert.match(app, /radial-gradient\(circle at 28% 18%/)
})
